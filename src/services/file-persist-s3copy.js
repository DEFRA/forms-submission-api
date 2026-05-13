import {
  CopyObjectCommand,
  DeleteObjectCommand,
  NoSuchKey
} from '@aws-sdk/client-s3'
import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { createTimer } from '~/src/helpers/timer.js'

const loadedPrefix = config.get('loadedPrefix')
const persistFileLogName = 'files.persist.file'

/**
 * Creates all copy tasks for the persist flow.
 * @param {PersistFileRequest[]} files
 * @param {S3Client} client
 * @param {Logger} perfLogger
 * @param {GetAndVerifyFn} getAndVerify
 */
export function createPersistCopyTasks(
  files,
  client,
  perfLogger,
  getAndVerify
) {
  return files.map(({ fileId, initiatedRetrievalKey }) =>
    copyS3File(fileId, initiatedRetrievalKey, client, getAndVerify, perfLogger)
  )
}

/**
 * Runs the pre-transaction verification and copy phase.
 * @param {Promise<PersistFileResult>[] } updateFiles
 * @param {Logger} perfLogger
 */
export async function completePreTransactionPhase(updateFiles, perfLogger) {
  const preTransactionTimer = createTimer()
  const copiedFiles = await Promise.all(updateFiles)
  const skippedCopyCount = copiedFiles.filter(
    ({ oldS3Key }) => oldS3Key === null
  ).length
  const copiedCount = copiedFiles.length - skippedCopyCount
  const timingSummary = summariseFileTimings(copiedFiles)

  perfLogger.info(
    {
      event: {
        action: 'files.persist.pre_transaction',
        category: 'process',
        duration: preTransactionTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
    `[persistFiles:perf] Pre-transaction verification and copy phase completed (copiedCount=${copiedCount} fileCount=${copiedFiles.length} skippedCopyCount=${skippedCopyCount})`
  )

  perfLogger.info(
    {
      event: {
        action: 'files.persist.summary.lookup',
        category: 'database',
        duration: timingSummary.lookupMs.totalMs,
        kind: 'metric',
        outcome: 'success',
        type: 'info'
      }
    },
    `[persistFiles:perf] Mongo lookup timing summary (averageMs=${timingSummary.lookupMs.averageMs} fileCount=${copiedFiles.length} maxMs=${timingSummary.lookupMs.maxMs})`
  )
  perfLogger.info(
    {
      event: {
        action: 'files.persist.summary.verify',
        category: 'process',
        duration: timingSummary.verifyMs.totalMs,
        kind: 'metric',
        outcome: 'success',
        type: 'info'
      }
    },
    `[persistFiles:perf] Retrieval key verification timing summary (averageMs=${timingSummary.verifyMs.averageMs} fileCount=${copiedFiles.length} maxMs=${timingSummary.verifyMs.maxMs})`
  )
  perfLogger.info(
    {
      event: {
        action: 'files.persist.summary.copy',
        category: 'file',
        duration: timingSummary.copyMs.totalMs,
        kind: 'metric',
        outcome: 'success',
        type: 'info'
      }
    },
    `[persistFiles:perf] S3 copy timing summary (averageMs=${timingSummary.copyMs.averageMs} fileCount=${copiedFiles.length} maxMs=${timingSummary.copyMs.maxMs})`
  )
  perfLogger.info(
    {
      event: {
        action: 'files.persist.summary.file_total',
        category: 'process',
        duration: timingSummary.totalMs.totalMs,
        kind: 'metric',
        outcome: 'success',
        type: 'info'
      }
    },
    `[persistFiles:perf] Per-file total timing summary (averageMs=${timingSummary.totalMs.averageMs} fileCount=${copiedFiles.length} maxMs=${timingSummary.totalMs.maxMs})`
  )

  return copiedFiles
}

/**
 * Deletes old files in staging based on the provided keys.
 * @param {Promise<PersistFileResult>[] } keys - an array of files to handle
 * @param {('oldS3Key'|'newS3Key')} lookupKey - the key to use to look up the S3 key
 * @param {S3Client} client - S3 client
 */
export async function deleteOldFiles(keys, lookupKey, client) {
  const settledKeys = await Promise.allSettled(keys)
  const filteredKeys = settledKeys
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((value) => value.oldS3Key !== null)

  return Promise.all(
    filteredKeys.flatMap((obj) => {
      const key = lookupKey === 'oldS3Key' ? obj.oldS3Key : obj.newS3Key

      return key === null
        ? []
        : [
            client.send(
              new DeleteObjectCommand({
                Bucket: obj.s3Bucket,
                Key: key
              })
            )
          ]
    })
  )
}

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
 * Copies a file document to the loaded S3 directory.
 * @param {string} fileId
 * @param {string} initiatedRetrievalKey - retrieval key when initiated
 * @param {S3Client} client - S3 client
 * @param {GetAndVerifyFn} getAndVerify
 * @param {Logger} [perfLogger] - optional logger for timing diagnostics
 */
async function copyS3File(
  fileId,
  initiatedRetrievalKey,
  client,
  getAndVerify,
  perfLogger
) {
  const fileLogger = perfLogger?.child({
    log: {
      logger: persistFileLogName
    }
  })
  const totalTimer = createTimer()
  const timings = createPersistFileTimings()
  const fileStatus = await getAndVerify(
    fileId,
    initiatedRetrievalKey,
    timings,
    fileLogger
  )
  const copyTarget = resolveCopyTarget(fileId, fileStatus)

  if (copyTarget.alreadyLoaded) {
    return createAlreadyLoadedResult(
      fileId,
      copyTarget,
      timings,
      totalTimer,
      fileLogger
    )
  }

  await copyFileToLoadedDirectory(client, fileId, copyTarget, timings)

  return createCopiedFileResult(
    fileId,
    copyTarget,
    timings,
    totalTimer,
    fileLogger
  )
}

/**
 * Creates an empty timings object for a persist flow file.
 */
function createPersistFileTimings() {
  return {
    lookupMs: 0,
    verifyMs: 0,
    copyMs: 0,
    totalMs: 0
  }
}

/**
 * Resolves the source and target S3 keys for a persisted file.
 * @param {string} fileId
 * @param {FormFileUploadStatus} fileStatus
 */
function resolveCopyTarget(fileId, fileStatus) {
  if (!fileStatus.s3Key || !fileStatus.s3Bucket) {
    throw Boom.internal(`S3 key/bucket is missing for file ID ${fileId}`)
  }

  const oldS3Key = fileStatus.s3Key

  return {
    s3Bucket: fileStatus.s3Bucket,
    oldS3Key,
    newS3Key: `${loadedPrefix}/${oldS3Key.split('/').at(-1)}`,
    alreadyLoaded: oldS3Key.startsWith(loadedPrefix)
  }
}

/**
 * Creates the result for a file that was already in the loaded directory.
 * @param {string} fileId
 * @param {PersistCopyTarget} copyTarget
 * @param {PersistFileTimings} timings
 * @param {{ elapsed: number }} totalTimer
 * @param {Logger | undefined} fileLogger
 */
function createAlreadyLoadedResult(
  fileId,
  copyTarget,
  timings,
  totalTimer,
  fileLogger
) {
  timings.totalMs = totalTimer.elapsed
  fileLogger?.debug(
    {
      event: {
        action: persistFileLogName,
        category: 'file',
        duration: timings.totalMs,
        kind: 'event',
        outcome: 'success',
        reason: 'already_loaded',
        reference: fileId,
        type: 'end'
      }
    },
    `[persistFiles:perf] File already loaded; skipped S3 copy (lookupMs=${timings.lookupMs} skippedCopy=true totalMs=${timings.totalMs} verifyMs=${timings.verifyMs})`
  )

  return {
    fileId,
    s3Bucket: copyTarget.s3Bucket,
    oldS3Key: null,
    newS3Key: copyTarget.oldS3Key,
    timings
  }
}

/**
 * Copies the file from staging into the loaded S3 prefix.
 * @param {S3Client} client
 * @param {string} fileId
 * @param {PersistCopyTarget} copyTarget
 * @param {PersistFileTimings} timings
 */
async function copyFileToLoadedDirectory(client, fileId, copyTarget, timings) {
  const copyTimer = createTimer()

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: copyTarget.s3Bucket,
        Key: copyTarget.newS3Key,
        CopySource: `${copyTarget.s3Bucket}/${copyTarget.oldS3Key}`
      })
    )
    timings.copyMs = copyTimer.elapsed
  } catch (err) {
    timings.copyMs = copyTimer.elapsed

    if (err instanceof NoSuchKey) {
      throw Boom.resourceGone(`File ${fileId} no longer exists`)
    }

    const error = err instanceof Error ? err : new Error('Unknown S3 error')
    logger.error(
      error,
      `[s3CopyFailure] Failed to copy file ${fileId} from ${copyTarget.oldS3Key} to ${copyTarget.newS3Key} in bucket ${copyTarget.s3Bucket} - ${error.message}`
    )

    throw err
  }
}

/**
 * Creates the result for a file that was copied successfully.
 * @param {string} fileId
 * @param {PersistCopyTarget} copyTarget
 * @param {PersistFileTimings} timings
 * @param {{ elapsed: number }} totalTimer
 * @param {Logger | undefined} fileLogger
 */
function createCopiedFileResult(
  fileId,
  copyTarget,
  timings,
  totalTimer,
  fileLogger
) {
  timings.totalMs = totalTimer.elapsed
  fileLogger?.debug(
    {
      event: {
        action: persistFileLogName,
        category: 'file',
        duration: timings.totalMs,
        kind: 'event',
        outcome: 'success',
        reference: fileId,
        type: 'end'
      }
    },
    `[persistFiles:perf] File verification and S3 copy completed (copyMs=${timings.copyMs} lookupMs=${timings.lookupMs} skippedCopy=false totalMs=${timings.totalMs} verifyMs=${timings.verifyMs})`
  )

  return {
    fileId,
    s3Bucket: copyTarget.s3Bucket,
    oldS3Key: copyTarget.oldS3Key,
    newS3Key: copyTarget.newS3Key,
    timings
  }
}
/**
 * @import { S3Client } from '@aws-sdk/client-s3'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 * @typedef {{ fileId: string, initiatedRetrievalKey: string }} PersistFileRequest
 * @typedef {{ lookupMs: number, verifyMs: number, copyMs: number, totalMs: number }} PersistFileTimings
 * @typedef {{ fileId: string, s3Bucket: string, oldS3Key: string | null, newS3Key: string, timings: PersistFileTimings }} PersistFileResult
 * @typedef {{ s3Bucket: string, oldS3Key: string, newS3Key: string, alreadyLoaded: boolean }} PersistCopyTarget
 * @typedef {(fileId: string, retrievalKey: string, timings?: PersistFileTimings, perfLogger?: Logger) => Promise<FormFileUploadStatus>} GetAndVerifyFn
 */
