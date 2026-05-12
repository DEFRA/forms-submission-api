import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
import contentDisposition from 'content-disposition'
import { MongoServerError } from 'mongodb'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { isRetrievalKeyCaseSensitive } from '~/src/helpers/retrieval-key/retrieval-key.js'
import { createTimer } from '~/src/helpers/timer.js'
import { client as mongoClient } from '~/src/mongo.js'
import * as repository from '~/src/repositories/file-repository.js'
import {
  createMainCsvFile,
  processRepeaterFiles
} from '~/src/services/service-helpers.js'
import { getS3Client } from '~/src/services/utils.js'

const loadedPrefix = config.get('loadedPrefix')

const ALREADY_INGESTED = 11000

/**
 * Summarises a set of duration values.
 * @param {number[]} values
 */
function summariseDurationValues(values) {
  const totalMs = values.reduce((sum, value) => sum + value, 0)

  return {
    totalMs,
    averageMs: values.length ? Math.round(totalMs / values.length) : 0,
    maxMs: values.length ? Math.max(...values) : 0
  }
}

/**
 * Summarises per-file timings for persistFiles.
 * @param {PersistFileResult[]} fileResults
 */
function summariseFileTimings(fileResults) {
  return {
    lookupMs: summariseDurationValues(
      fileResults.map((result) => result.timings.lookupMs)
    ),
    verifyMs: summariseDurationValues(
      fileResults.map((result) => result.timings.verifyMs)
    ),
    copyMs: summariseDurationValues(
      fileResults.map((result) => result.timings.copyMs)
    ),
    totalMs: summariseDurationValues(
      fileResults.map((result) => result.timings.totalMs)
    )
  }
}

/**
 * Accepts file status into the forms-submission-api
 * @param {UploadPayload} uploadPayload
 */
export async function ingestFile(uploadPayload) {
  const { retrievalKey } = uploadPayload.metadata
  const rawFile = uploadPayload.form.file

  // CDP returns form.file as a single object for one file,
  // or an array for multiple files. The Joi schema normalises
  // both to an array via .single(), but handle both for safety.
  const files = Array.isArray(rawFile) ? rawFile : [rawFile]

  const completeFiles = files.filter((f) => f.fileStatus === 'complete')
  const rejectedFiles = files.filter((f) => f.fileStatus !== 'complete')

  for (const rejected of rejectedFiles) {
    logger.info(
      `[ingestFile] Skipping file ${rejected.fileId} (${rejected.filename}) - status: ${rejected.fileStatus} - error: ${rejected.errorMessage ?? 'none'}`
    )
  }

  if (!completeFiles.length) {
    logger.info(
      `[ingestFile] No complete files to ingest out of ${files.length} file(s)`
    )
    return
  }

  // Force new files to use a case insensitive password match
  const retrievalKeyIsCaseSensitive = false
  const hashed = await argon2.hash(retrievalKey.toLowerCase())

  for (const fileContainer of completeFiles) {
    await assertFileExists(
      fileContainer,
      Boom.badRequest('File does not exist in S3'),
      false
    )

    /** @type {FormFileUploadStatus} */
    const dataToSave = {
      fileId: fileContainer.fileId,
      filename: fileContainer.filename,
      contentType: fileContainer.contentType,
      s3Key: fileContainer.s3Key,
      s3Bucket: fileContainer.s3Bucket,
      retrievalKey: hashed,
      retrievalKeyIsCaseSensitive
    }

    try {
      await repository.create(dataToSave)
    } catch (err) {
      if (
        err instanceof MongoServerError &&
        err.errorResponse.code === ALREADY_INGESTED
      ) {
        const message = `File ID '${fileContainer.fileId}' has already been ingested`

        logger.error(
          err,
          `[duplicateFileIngestion] ${message} - fileId: ${fileContainer.fileId} - code: ${ALREADY_INGESTED}`
        )

        throw Boom.badRequest(message)
      }

      throw err
    }
  }
}

/**
 * Confirms a file exists in S3 by throwing Boom.badRequest if not.
 * @param {{s3Bucket?: string, s3Key?: string}} fileIdentifier - Object containing S3 bucket and key information
 * @param {Error} errorToThrow
 * @param {boolean} [logAsError] - whether to log the error
 */
async function assertFileExists(
  fileIdentifier,
  errorToThrow,
  logAsError = true
) {
  try {
    const client = getS3Client()

    const command = new HeadObjectCommand({
      Bucket: fileIdentifier.s3Bucket,
      Key: fileIdentifier.s3Key
    })

    await client.send(command)
  } catch (err) {
    if (err instanceof NotFound) {
      if (logAsError) {
        logger.error(
          err,
          `[fileNotFound] File not found in S3: ${fileIdentifier.s3Key} in bucket: ${fileIdentifier.s3Bucket}`
        )
      } else {
        logger.info(
          `[fileNotFound] File not found in S3: ${fileIdentifier.s3Key} in bucket: ${fileIdentifier.s3Bucket}`
        )
      }

      throw errorToThrow
    }

    throw err
  }
}

/**
 *
 * @param {string} fileId
 * @param {string} retrievalKey
 * @returns {Promise<string>} presigned url
 */
export async function getPresignedLink(fileId, retrievalKey) {
  const fileStatus = await getAndVerify(fileId, retrievalKey)
  const client = getS3Client()

  await assertFileExists(fileStatus, Boom.resourceGone(), false)

  const contentDispositionHeader = contentDisposition(fileStatus.filename)

  const command = new GetObjectCommand({
    Bucket: fileStatus.s3Bucket,
    Key: fileStatus.s3Key,
    ResponseContentDisposition: contentDispositionHeader
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}

/**
 * Extends the time-to-live of a file to 30 days and updates the retrieval key.
 * @param {{fileId: string, initiatedRetrievalKey: string}[]} files
 * @param {string} persistedRetrievalKey - an updated retrieval key to persist the file
 */
export async function persistFiles(files, persistedRetrievalKey) {
  const client = getS3Client()
  const session = mongoClient.startSession()
  const perfLogger = logger.child({
    operation: 'persistFiles',
    fileCount: files.length
  })
  const totalTimer = createTimer()

  /**
   * @type {Promise<PersistFileResult>[]}
   */
  let updateFiles = []
  /** @type {PersistFileResult[]} */
  let copiedFiles = []

  perfLogger.info('[persistFiles:perf] Starting persist flow')

  try {
    const preTransactionTimer = createTimer()

    updateFiles = files.map(({ fileId, initiatedRetrievalKey }) =>
      copyS3File(fileId, initiatedRetrievalKey, client, perfLogger)
    )

    copiedFiles = await Promise.all(updateFiles)

    const skippedCopyCount = copiedFiles.filter(
      ({ oldS3Key }) => oldS3Key === undefined
    ).length
    const copiedCount = copiedFiles.length - skippedCopyCount

    perfLogger.info(
      {
        durationMs: preTransactionTimer.elapsed,
        copiedCount,
        skippedCopyCount,
        perFileTimingSummary: summariseFileTimings(copiedFiles)
      },
      '[persistFiles:perf] Pre-transaction verification and copy phase completed'
    )

    const transactionTimer = createTimer()
    await session.withTransaction(async () => {
      logger.info(`Persisting ${files.length} files`)

      const updateS3KeysTimer = createTimer()
      await repository.updateS3Keys(copiedFiles, session)
      perfLogger.info(
        { durationMs: updateS3KeysTimer.elapsed },
        '[persistFiles:perf] updateS3Keys completed'
      )

      // Once we know the files have copied successfully, we can update the database
      const hashTimer = createTimer()
      const persistedRetrievalKeyHashed = await argon2.hash(
        persistedRetrievalKey.toLowerCase()
      )
      perfLogger.info(
        { durationMs: hashTimer.elapsed },
        '[persistFiles:perf] persisted retrieval key hash completed'
      )

      // Force new persists to be password case-insensitive
      const retrievalKeyIsCaseSensitive = false
      const updateRetrievalKeysTimer = createTimer()
      await repository.updateRetrievalKeys(
        files.map(({ fileId }) => fileId),
        persistedRetrievalKeyHashed,
        retrievalKeyIsCaseSensitive,
        session
      )
      perfLogger.info(
        { durationMs: updateRetrievalKeysTimer.elapsed },
        '[persistFiles:perf] updateRetrievalKeys completed'
      )
    })

    perfLogger.info(
      { durationMs: transactionTimer.elapsed },
      '[persistFiles:perf] Transaction phase completed'
    )

    logger.info(`Finished persisting ${files.length} files`)
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error')
    logger.error(
      error,
      `[persistFiles] Error persisting ${files.length} files - ${error.message}`
    )

    // no point persisting part of a batch. clean it up.
    const rollbackCleanupTimer = createTimer()
    await deleteOldFiles(updateFiles, 'newS3Key', client)
    perfLogger.info(
      {
        durationMs: rollbackCleanupTimer.elapsed,
        attemptedFileCount: files.length
      },
      '[persistFiles:perf] Rollback cleanup of newly copied files completed'
    )

    throw err
  } finally {
    await session.endSession()
  }

  // Usage example:
  if (updateFiles.length) {
    // Only delete the old files once the pointer update has succeeded. Handle this outside of the DB session as we don't
    // want a failure here to revert our DB changes. If this fails, files will naturally expire in the original directory after 7 days
    // anyway, so this ultimately is just a cost issue not a functional one.
    const deleteOriginalFilesTimer = createTimer()
    await deleteOldFiles(updateFiles, 'oldS3Key', client)
    perfLogger.info(
      {
        durationMs: deleteOriginalFilesTimer.elapsed,
        deletedFileCount: copiedFiles.filter(
          ({ oldS3Key }) => oldS3Key !== undefined
        ).length
      },
      '[persistFiles:perf] Original file cleanup completed'
    )
  }

  perfLogger.info(
    { durationMs: totalTimer.elapsed },
    '[persistFiles:perf] Persist flow completed'
  )
}

/**
 * Deletes old files in staging based on the provided keys.
 * @param {Promise<PersistFileResult>[] } keys - an array of files to handle
 * @param {('oldS3Key'|'newS3Key')} lookupKey - the key to use to look up the S3 key
 * @param {S3Client} client - S3 client
 */
async function deleteOldFiles(keys, lookupKey, client) {
  const settledKeys = await Promise.allSettled(keys)
  const filteredKeys = settledKeys
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((value) => value.oldS3Key !== undefined) // Filter out any undefined results (files that didn't need copying)

  // AWS do have the DeleteObjects command instead which would be preferable. However, S3 keys
  // are stored on a per-document basis not a global and so we can't batch these up in case of any
  // variation.
  return Promise.all(
    filteredKeys.map((obj) =>
      client.send(
        new DeleteObjectCommand({
          Bucket: obj.s3Bucket,
          Key: obj[lookupKey]
        })
      )
    )
  )
}

/**
 * Copies a file document to the loaded S3 directory.
 * @param {string} fileId
 * @param {string} initiatedRetrievalKey - retrieval key when initiated
 * @param {S3Client} client - S3 client
 * @param {Logger} [perfLogger] - optional logger for timing diagnostics
 */
async function copyS3File(fileId, initiatedRetrievalKey, client, perfLogger) {
  const fileLogger = perfLogger?.child({ fileId })
  const totalTimer = createTimer()
  /** @type {PersistFileTimings} */
  const timings = {
    lookupMs: 0,
    verifyMs: 0,
    copyMs: 0,
    totalMs: 0
  }

  const fileStatus = await getAndVerify(
    fileId,
    initiatedRetrievalKey,
    timings,
    fileLogger
  )

  if (!fileStatus.s3Key || !fileStatus.s3Bucket) {
    throw Boom.internal(`S3 key/bucket is missing for file ID ${fileId}`)
  }

  if (fileStatus.s3Key.startsWith(loadedPrefix)) {
    const msg = `File ${fileId} is already in the loaded directory, no need to copy`

    logger.info(`[copyS3File] ${msg}`)
    timings.totalMs = totalTimer.elapsed
    fileLogger?.debug(
      {
        timings,
        skippedCopy: true
      },
      '[persistFiles:perf] File already loaded; skipped S3 copy'
    )

    return {
      fileId,
      s3Bucket: fileStatus.s3Bucket,
      oldS3Key: undefined, // Marker to indicate no copy was needed
      newS3Key: fileStatus.s3Key,
      timings
    }
  }

  const oldS3Key = fileStatus.s3Key
  const filename = oldS3Key.split('/').at(-1)
  const newS3Key = `${loadedPrefix}/${filename}`
  const copyTimer = createTimer()

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: fileStatus.s3Bucket,
        Key: newS3Key,
        CopySource: `${fileStatus.s3Bucket}/${oldS3Key}`
      })
    )
    timings.copyMs = copyTimer.elapsed
  } catch (err) {
    timings.copyMs = copyTimer.elapsed

    if (err instanceof NoSuchKey) {
      throw Boom.resourceGone(`File ${fileId} no longer exists`)
    }

    // Log unexpected S3 errors
    const error = err instanceof Error ? err : new Error('Unknown S3 error')
    logger.error(
      error,
      `[s3CopyFailure] Failed to copy file ${fileId} from ${oldS3Key} to ${newS3Key} in bucket ${fileStatus.s3Bucket} - ${error.message}`
    )

    throw err
  }

  timings.totalMs = totalTimer.elapsed
  fileLogger?.debug(
    {
      timings,
      skippedCopy: false
    },
    '[persistFiles:perf] File verification and S3 copy completed'
  )

  return {
    fileId,
    s3Bucket: fileStatus.s3Bucket,
    oldS3Key,
    newS3Key,
    timings
  }
}

/**
 * Retrieves a file status from the database, verifying the retrieval key before returning.
 * @param {string} fileId
 * @param {string} retrievalKey
 * @param {PersistFileTimings} [timings]
 * @param {Logger} [perfLogger]
 */
async function getAndVerify(fileId, retrievalKey, timings, perfLogger) {
  const lookupTimer = createTimer()
  const fileStatus = await repository.getByFileId(fileId)
  const lookupMs = lookupTimer.elapsed

  if (timings) {
    timings.lookupMs = lookupMs
  }

  perfLogger?.debug(
    { durationMs: lookupMs },
    '[persistFiles:perf] Mongo file lookup completed'
  )

  if (!fileStatus) {
    throw Boom.notFound('File not found')
  }

  const verifyTimer = createTimer()
  const retrievalKeyCorrect = await argon2.verify(
    fileStatus.retrievalKey,
    retrievalKey
  )
  const verifyMs = verifyTimer.elapsed

  if (timings) {
    timings.verifyMs = verifyMs
  }

  perfLogger?.debug(
    { durationMs: verifyMs },
    '[persistFiles:perf] Retrieval key verification completed'
  )

  if (!retrievalKeyCorrect) {
    logger.info(
      `[authFailed] Failed authentication attempt for fileId: ${fileId} - incorrect retrieval key - s3Key: ${fileStatus.s3Key}`
    )

    throw Boom.forbidden(`Retrieval key for file ${fileId} is incorrect`)
  }

  logger.info(
    `[authSuccess] Successful authentication for fileId: ${fileId}- s3Key: ${fileStatus.s3Key}`
  )

  return fileStatus
}

/**
 * Checks if a file status exists for a given upload ID.
 * Throws a Not Found error if not in the database.
 * @param {string} fileId
 * @returns {Promise<FormFileUploadStatus>} Returns the file status object
 * @throws {Boom.notFound} - if the file status does not exist
 */
export async function checkFileStatus(fileId) {
  const fileStatus = await repository.getByFileId(fileId)

  if (!fileStatus) {
    throw Boom.notFound()
  }

  await assertFileExists(fileStatus, Boom.resourceGone(), false)

  return fileStatus
}

/**
 * Accepts submissions into the forms-submission-api
 * @param {SubmitPayload} submitPayload
 */
export async function submit(submitPayload) {
  const { sessionId, retrievalKey, main, repeaters } = submitPayload
  const retrievalKeyIsCaseSensitive = isRetrievalKeyCaseSensitive(retrievalKey)
  const hashedRetrievalKey = await argon2.hash(retrievalKey)

  try {
    const mainFileId = await createMainCsvFile(
      main,
      hashedRetrievalKey,
      retrievalKeyIsCaseSensitive
    )
    const repeaterFileIds = await processRepeaterFiles(
      repeaters,
      hashedRetrievalKey,
      retrievalKeyIsCaseSensitive
    )

    return {
      main: mainFileId,
      repeaters: repeaterFileIds
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error')
    logger.error(
      error,
      `[submitFiles] Failed to save files for sessionId: ${sessionId} - ${error.message}`
    )

    if (Boom.isBoom(err)) {
      throw err
    }

    throw new Error(`Failed to save files for session ID '${sessionId}'.`)
  }
}

/**
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { S3Client } from '@aws-sdk/client-s3'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 * @typedef {{ lookupMs: number, verifyMs: number, copyMs: number, totalMs: number }} PersistFileTimings
 * @typedef {{ fileId: string, s3Bucket: string, oldS3Key: string | undefined, newS3Key: string, timings: PersistFileTimings }} PersistFileResult
 */
