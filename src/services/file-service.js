import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
import { create as contentDisposition } from 'content-disposition'
import { MongoServerError } from 'mongodb'

import { logger } from '~/src/helpers/logging/logger.js'
import { isRetrievalKeyCaseSensitive } from '~/src/helpers/retrieval-key/retrieval-key.js'
import * as repository from '~/src/repositories/file-repository.js'
import { getAndVerify } from '~/src/services/file-persist-service.js'
import {
  createMainCsvFile,
  processRepeaterFiles
} from '~/src/services/service-helpers.js'
import { getS3Client } from '~/src/services/utils.js'

export { persistFiles } from '~/src/services/file-persist-service.js'

const ALREADY_INGESTED = 11000

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
 * @import { FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 */
