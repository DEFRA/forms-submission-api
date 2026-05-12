import argon2 from 'argon2'

import { logger } from '~/src/helpers/logging/logger.js'
import { createTimer } from '~/src/helpers/timer.js'
import * as repository from '~/src/repositories/file-repository.js'
import { deleteOldFiles } from '~/src/services/file-persist-s3copy.js'

/**
 * Wraps the persist flow so the final duration is logged on both success and failure.
 * @param {Logger} perfLogger
 * @param {{ elapsed: number }} totalTimer
 * @param {() => Promise<void>} operation
 */
export async function withPersistFlowCompletionLogging(
  perfLogger,
  totalTimer,
  operation
) {
  /** @type {'success' | 'failure'} */
  let outcome = 'success'
  /** @type {Error | undefined} */
  let error

  try {
    await operation()
  } catch (err) {
    outcome = 'failure'
    error = toError(err)

    throw err
  } finally {
    const logData = {
      durationMs: totalTimer.elapsed,
      outcome
    }

    if (error) {
      perfLogger.warn(
        {
          ...logData,
          error: error.message
        },
        '[persistFiles:perf] Persist flow completed'
      )
    } else {
      perfLogger.info(logData, '[persistFiles:perf] Persist flow completed')
    }
  }
}

/**
 * Runs the Mongo transaction that persists copied file state.
 * @param {PersistFileRequest[]} files
 * @param {PersistFileResult[]} copiedFiles
 * @param {string} persistedRetrievalKey
 * @param {import('mongodb').ClientSession} session
 * @param {Logger} perfLogger
 */
export async function runPersistTransaction(
  files,
  copiedFiles,
  persistedRetrievalKey,
  session,
  perfLogger
) {
  const transactionTimer = createTimer()

  await session.withTransaction(async () => {
    logger.info(`Persisting ${files.length} files`)

    await updatePersistedS3Keys(copiedFiles, session, perfLogger)

    const persistedRetrievalKeyHashed = await hashPersistedRetrievalKey(
      persistedRetrievalKey,
      perfLogger
    )

    await updatePersistedRetrievalKeys(
      files,
      persistedRetrievalKeyHashed,
      session,
      perfLogger
    )
  })

  perfLogger.info(
    { durationMs: transactionTimer.elapsed },
    '[persistFiles:perf] Transaction phase completed'
  )

  logger.info(`Finished persisting ${files.length} files`)
}

/**
 * Handles rollback cleanup and error logging when the persist flow fails.
 * @param {unknown} err
 * @param {number} fileCount
 * @param {Promise<PersistFileResult>[] } updateFiles
 * @param {S3Client} client
 * @param {Logger} perfLogger
 */
export async function handlePersistFilesFailure(
  err,
  fileCount,
  updateFiles,
  client,
  perfLogger
) {
  const error = toError(err)

  logger.error(
    error,
    `[persistFiles] Error persisting ${fileCount} files - ${error.message}`
  )

  const rollbackCleanupTimer = createTimer()
  await deleteOldFiles(updateFiles, 'newS3Key', client)
  perfLogger.info(
    {
      durationMs: rollbackCleanupTimer.elapsed,
      attemptedFileCount: fileCount
    },
    '[persistFiles:perf] Rollback cleanup of newly copied files completed'
  )
}

/**
 * Deletes the original staged files after the DB updates succeed.
 * @param {Promise<PersistFileResult>[] } updateFiles
 * @param {PersistFileResult[]} copiedFiles
 * @param {S3Client} client
 * @param {Logger} perfLogger
 */
export async function cleanupOriginalFiles(
  updateFiles,
  copiedFiles,
  client,
  perfLogger
) {
  if (!updateFiles.length) {
    return
  }

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

/**
 * Updates the stored S3 keys for files that were copied.
 * @param {PersistFileResult[]} copiedFiles
 * @param {import('mongodb').ClientSession} session
 * @param {Logger} perfLogger
 */
async function updatePersistedS3Keys(copiedFiles, session, perfLogger) {
  const updateS3KeysTimer = createTimer()

  await repository.updateS3Keys(copiedFiles, session)

  perfLogger.info(
    { durationMs: updateS3KeysTimer.elapsed },
    '[persistFiles:perf] updateS3Keys completed'
  )
}

/**
 * Hashes the retrieval key used for the persisted files.
 * @param {string} persistedRetrievalKey
 * @param {Logger} perfLogger
 */
async function hashPersistedRetrievalKey(persistedRetrievalKey, perfLogger) {
  const hashTimer = createTimer()
  const persistedRetrievalKeyHashed = await argon2.hash(
    persistedRetrievalKey.toLowerCase()
  )

  perfLogger.info(
    { durationMs: hashTimer.elapsed },
    '[persistFiles:perf] persisted retrieval key hash completed'
  )

  return persistedRetrievalKeyHashed
}

/**
 * Updates the retrieval keys after the files have been copied.
 * @param {PersistFileRequest[]} files
 * @param {string} persistedRetrievalKeyHashed
 * @param {import('mongodb').ClientSession} session
 * @param {Logger} perfLogger
 */
async function updatePersistedRetrievalKeys(
  files,
  persistedRetrievalKeyHashed,
  session,
  perfLogger
) {
  const updateRetrievalKeysTimer = createTimer()
  const retrievalKeyIsCaseSensitive = false

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
}

/**
 * Normalises unknown thrown values into an Error instance.
 * @param {unknown} err
 */
function toError(err) {
  return err instanceof Error ? err : new Error('Unknown error')
}

/**
 * @import { S3Client } from '@aws-sdk/client-s3'
 * @import { Logger } from 'pino'
 * @typedef {{ fileId: string, initiatedRetrievalKey: string }} PersistFileRequest
 * @typedef {{ lookupMs: number, verifyMs: number, copyMs: number, totalMs: number }} PersistFileTimings
 * @typedef {{ fileId: string, s3Bucket: string, oldS3Key: string | undefined, newS3Key: string, timings: PersistFileTimings }} PersistFileResult
 */
