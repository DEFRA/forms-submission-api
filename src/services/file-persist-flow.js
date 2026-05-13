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
    if (error) {
      perfLogger.warn(
        {
          event: {
            action: 'files.persist.flow',
            category: 'process',
            duration: totalTimer.elapsed,
            kind: 'event',
            outcome,
            reason: error.message,
            type: 'end'
          },
          error: {
            message: error.message
          }
        },
        '[persistFiles:perf] Persist flow completed'
      )
    } else {
      perfLogger.info(
        {
          event: {
            action: 'files.persist.flow',
            category: 'process',
            duration: totalTimer.elapsed,
            kind: 'event',
            outcome,
            type: 'end'
          }
        },
        '[persistFiles:perf] Persist flow completed'
      )
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
    {
      event: {
        action: 'files.persist.transaction',
        category: 'database',
        duration: transactionTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
    `[persistFiles:perf] Transaction phase completed (fileCount=${files.length})`
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
      event: {
        action: 'files.persist.cleanup.rollback',
        category: 'file',
        duration: rollbackCleanupTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        reason: 'persist_flow_failed',
        type: 'end'
      }
    },
    `[persistFiles:perf] Rollback cleanup of newly copied files completed (attemptedFileCount=${fileCount})`
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
      event: {
        action: 'files.persist.cleanup.original',
        category: 'file',
        duration: deleteOriginalFilesTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
    `[persistFiles:perf] Original file cleanup completed (deletedFileCount=${copiedFiles.filter(({ oldS3Key }) => oldS3Key !== undefined).length})`
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
    {
      event: {
        action: 'files.persist.update_s3_keys',
        category: 'database',
        duration: updateS3KeysTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
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
    {
      event: {
        action: 'files.persist.retrieval_key_hash',
        category: 'process',
        duration: hashTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
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
    {
      event: {
        action: 'files.persist.update_retrieval_keys',
        category: 'database',
        duration: updateRetrievalKeysTimer.elapsed,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
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
