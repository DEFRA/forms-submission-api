import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { logger } from '~/src/helpers/logging/logger.js'
import { createTimer } from '~/src/helpers/timer.js'
import { client as mongoClient } from '~/src/mongo.js'
import * as repository from '~/src/repositories/file-repository.js'
import {
  cleanupOriginalFiles,
  handlePersistFilesFailure,
  hashPersistedRetrievalKey,
  runPersistTransaction,
  withPersistFlowCompletionLogging
} from '~/src/services/file-persist-flow.js'
import {
  completePreTransactionPhase,
  createPersistCopyTasks
} from '~/src/services/file-persist-s3copy.js'
import { getS3Client } from '~/src/services/utils.js'

/**
 * Extends the time-to-live of a file to 30 days and updates the retrieval key.
 * @param {PersistFileRequest[]} files
 * @param {string} persistedRetrievalKey - an updated retrieval key to persist the file
 */
export async function persistFiles(files, persistedRetrievalKey) {
  const client = getS3Client()
  const session = mongoClient.startSession()
  const perfLogger = logger.child({
    log: {
      logger: 'files.persist'
    }
  })
  const totalTimer = createTimer()

  return withPersistFlowCompletionLogging(perfLogger, totalTimer, async () => {
    /** @type {PersistFileResult[]} */
    let copiedFiles = []
    /** @type {Promise<PersistFileResult>[] } */
    let updateFiles = []

    perfLogger.info(
      {
        event: {
          action: 'files.persist.flow',
          category: 'process',
          kind: 'event',
          type: 'start'
        }
      },
      `[persistFiles:perf] Starting persist flow (fileCount=${files.length})`
    )

    try {
      const fileStatuses = await batchGetFileStatuses(files, perfLogger)

      updateFiles = createPersistCopyTasks(
        files,
        client,
        perfLogger,
        createBatchGetAndVerify(fileStatuses)
      )

      // Hashing doesn't depend on the copies, so run it alongside them. If
      // either fails, Promise.all rejects and the rollback below removes any
      // files that were copied.
      const [copied, persistedRetrievalKeyHashed] = await Promise.all([
        completePreTransactionPhase(updateFiles, perfLogger),
        hashPersistedRetrievalKey(persistedRetrievalKey, perfLogger)
      ])

      copiedFiles = copied

      await runPersistTransaction(
        files,
        copiedFiles,
        persistedRetrievalKeyHashed,
        session,
        perfLogger
      )
    } catch (err) {
      await handlePersistFilesFailure(
        err,
        files.length,
        updateFiles,
        client,
        perfLogger
      )
      throw err
    } finally {
      await session.endSession()
    }

    await cleanupOriginalFiles(updateFiles, copiedFiles, client, perfLogger)
  })
}

/**
 * Retrieves a file status from the database, verifying the retrieval key before returning.
 * @param {string} fileId
 * @param {string} retrievalKey
 * @param {PersistFileTimings} [timings]
 * @param {Logger} [perfLogger]
 */
export async function getAndVerify(fileId, retrievalKey, timings, perfLogger) {
  const lookupTimer = createTimer()
  const fileStatus = await repository.getByFileId(fileId)
  const lookupMs = lookupTimer.elapsed

  if (timings) {
    timings.lookupMs = lookupMs
  }

  perfLogger?.debug(
    {
      event: {
        action: 'files.persist.mongo_lookup',
        category: 'database',
        duration: lookupMs,
        kind: 'event',
        outcome: 'success',
        reference: fileId,
        type: 'end'
      }
    },
    '[persistFiles:perf] Mongo file lookup completed'
  )

  if (!fileStatus) {
    throw Boom.notFound('File not found')
  }

  return verifyRetrievalKey(
    fileId,
    fileStatus,
    retrievalKey,
    timings,
    perfLogger
  )
}

/**
 * Verifies a retrieval key against a file status already fetched from the
 * database. When a verifyCache is supplied, argon2.verify calls that share
 * an identical stored hash and plaintext key are only performed once - the
 * in-flight/settled promise is reused, so concurrent callers with the same
 * pair wait on the same verification rather than triggering their own.
 * @param {string} fileId
 * @param {FormFileUploadStatus} fileStatus
 * @param {string} retrievalKey
 * @param {PersistFileTimings} [timings]
 * @param {Logger} [perfLogger]
 * @param {Map<string, Promise<boolean>>} [verifyCache]
 */
async function verifyRetrievalKey(
  fileId,
  fileStatus,
  retrievalKey,
  timings,
  perfLogger,
  verifyCache
) {
  const verifyTimer = createTimer()
  const cacheKey = `${fileStatus.retrievalKey}::${retrievalKey}`
  let verifyPromise = verifyCache?.get(cacheKey)

  if (!verifyPromise) {
    verifyPromise = argon2.verify(fileStatus.retrievalKey, retrievalKey)
    verifyCache?.set(cacheKey, verifyPromise)
  }

  const retrievalKeyCorrect = await verifyPromise
  const verifyMs = verifyTimer.elapsed

  if (timings) {
    timings.verifyMs = verifyMs
  }

  perfLogger?.debug(
    {
      event: {
        action: 'files.persist.retrieval_key_verify',
        category: 'process',
        duration: verifyMs,
        kind: 'event',
        outcome: 'success',
        reference: fileId,
        type: 'end'
      }
    },
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
 * Fetches file statuses for a persist batch in as few Mongo round trips as
 * possible, instead of one lookup per file, and reports how many of the
 * batch's retrieval-key verifications will actually be distinct - files
 * ingested together share an identical stored hash, so verifying them
 * collapses to a single argon2.verify call.
 * @param {PersistFileRequest[]} files
 * @param {Logger} perfLogger
 * @returns {Promise<Map<string, FormFileUploadStatus>>}
 */
export async function batchGetFileStatuses(files, perfLogger) {
  const fileIds = files.map(({ fileId }) => fileId)
  const lookupTimer = createTimer()
  const fileStatuses = await repository.getByFileIds(fileIds)
  const lookupMs = lookupTimer.elapsed

  perfLogger.info(
    {
      event: {
        action: 'files.persist.batch_lookup',
        category: 'database',
        duration: lookupMs,
        kind: 'event',
        outcome: 'success',
        type: 'end'
      }
    },
    `[persistFiles:perf] Batch file status lookup completed (foundCount=${fileStatuses.size} fileCount=${fileIds.length})`
  )

  const uniqueVerifyCount = new Set(
    files.map(
      ({ fileId, initiatedRetrievalKey }) =>
        `${fileStatuses.get(fileId)?.retrievalKey}::${initiatedRetrievalKey}`
    )
  ).size

  perfLogger.info(
    {
      event: {
        action: 'files.persist.verify_dedup',
        category: 'process',
        kind: 'metric',
        outcome: 'success',
        type: 'info'
      }
    },
    `[persistFiles:perf] Retrieval key verification dedup summary (uniqueVerifyCount=${uniqueVerifyCount} fileCount=${files.length})`
  )

  return fileStatuses
}

/**
 * Creates a getAndVerify-compatible function that resolves file statuses
 * from a pre-fetched batch instead of querying Mongo per file, and
 * memoizes argon2.verify calls within the batch.
 * @param {Map<string, FormFileUploadStatus>} fileStatuses
 * @returns {GetAndVerifyFn}
 */
function createBatchGetAndVerify(fileStatuses) {
  /** @type {Map<string, Promise<boolean>>} */
  const verifyCache = new Map()

  return async function getAndVerifyFromBatch(
    fileId,
    retrievalKey,
    timings,
    perfLogger
  ) {
    const fileStatus = fileStatuses.get(fileId)

    if (!fileStatus) {
      throw Boom.notFound('File not found')
    }

    return verifyRetrievalKey(
      fileId,
      fileStatus,
      retrievalKey,
      timings,
      perfLogger,
      verifyCache
    )
  }
}
/**
 * @import { S3Client } from '@aws-sdk/client-s3'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 * @import { GetAndVerifyFn } from '~/src/services/file-persist-s3copy.js'
 * @typedef {{ fileId: string, initiatedRetrievalKey: string }} PersistFileRequest
 * @typedef {{ lookupMs: number, verifyMs: number, copyMs: number, totalMs: number }} PersistFileTimings
 * @typedef {{ fileId: string, s3Bucket: string, oldS3Key: string | null, newS3Key: string, timings: PersistFileTimings }} PersistFileResult
 */
