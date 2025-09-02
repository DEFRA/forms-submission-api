import { ObjectId } from 'mongodb'

/**
 * @typedef {object} Ttl
 * @property {Date} expireAt - Time to live
 * @typedef {RunnerRecordInput & Ttl} RunnerRecordInputWithTtl
 */

import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { SAVE_AND_EXIT_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()
const expiryInDays = config.get('saveAndExitExpiryInDays')

/**
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
export function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

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
    const result = await coll.findOne({ _id: new ObjectId(id) })

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
 * @returns {Promise<ObjectId>} newId
 */
export async function createSaveAndExitRecord(recordInput, session) {
  logger.info(`Inserting ${recordInput.messageId}`)

  const coll = /** @type {Collection<RunnerRecordInputWithTtl>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const res = await coll.insertOne(
      {
        ...recordInput,
        expireAt: addDays(new Date(), expiryInDays)
      },
      { session }
    )

    logger.info(`Inserted ${recordInput.messageId}`)

    return res.insertedId
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
