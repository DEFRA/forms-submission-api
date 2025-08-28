import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { SAVE_AND_EXIT_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Gets a record based on id
 * @param {string} id
 * @returns { Promise<WithId<RunnerRecord> | null> }
 */
export async function getSaveAndExitRecord(id) {
  logger.info('Reading save-and-exit records')

  const coll = /** @type {Collection<RunnerRecord>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOne({ entityId: id })

    logger.info('Read save-and-exit records')

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to read save-and-exit records - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Creates a save-and-exit record from SubmissionRecordInput
 * @param {RunnerRecordInput} recordInput
 * @param {ClientSession} session
 */
export async function createSaveAndExitRecord(recordInput, session) {
  logger.info(`Inserting ${recordInput.messageId}`)

  const coll = /** @type {Collection<RunnerRecordInput>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    await coll.insertOne(recordInput, { session })

    logger.info(`Inserted ${recordInput.messageId}`)
  } catch (err) {
    logger.error(
      err,
      `Failed to insert ${recordInput.messageId} - ${getErrorMessage(err)} `
    )
    throw err
  }
}

/**
 * @import { RunnerRecordInput, RunnerRecord } from '@defra/forms-model'
 * @import { ClientSession, Collection, WithId } from 'mongodb'
 */
