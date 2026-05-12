import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { logger } from '~/src/helpers/logging/logger.js'
import { createTimer } from '~/src/helpers/timer.js'
import { client as mongoClient } from '~/src/mongo.js'
import * as repository from '~/src/repositories/file-repository.js'
import {
  cleanupOriginalFiles,
  handlePersistFilesFailure,
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
    operation: 'persistFiles',
    fileCount: files.length
  })
  const totalTimer = createTimer()

  return withPersistFlowCompletionLogging(perfLogger, totalTimer, async () => {
    /** @type {Promise<PersistFileResult>[] } */
    const updateFiles = createPersistCopyTasks(
      files,
      client,
      perfLogger,
      getAndVerify
    )
    /** @type {PersistFileResult[]} */
    let copiedFiles = []

    perfLogger.info('[persistFiles:perf] Starting persist flow')

    try {
      copiedFiles = await completePreTransactionPhase(updateFiles, perfLogger)
      await runPersistTransaction(
        files,
        copiedFiles,
        persistedRetrievalKey,
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
 * @import { S3Client } from '@aws-sdk/client-s3'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 * @typedef {{ fileId: string, initiatedRetrievalKey: string }} PersistFileRequest
 * @typedef {{ lookupMs: number, verifyMs: number, copyMs: number, totalMs: number }} PersistFileTimings
 * @typedef {{ fileId: string, s3Bucket: string, oldS3Key: string | undefined, newS3Key: string, timings: PersistFileTimings }} PersistFileResult
 */
