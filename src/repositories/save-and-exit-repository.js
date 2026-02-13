import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'
import { addDays } from '~/src/helpers/date-helper.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { SAVE_AND_EXIT_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()
const expiryInDays = config.get('saveAndExitExpiryInDays')
const maxInvalidPasswordAttempts = 5

/**
 * Gets a save and exit record based on magic link id
 * @param {string} id
 * @returns { Promise<WithId<SaveAndExitDocument> | null> }
 */
export async function getSaveAndExitRecord(id) {
  logger.info('Reading save and exit record')

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOne({
      magicLinkId: id,
      consumed: { $ne: true }
    })

    logger.info('Read save and exit record')

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to read save and exit record - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Creates a save and exit record from SubmissionRecordInput
 * @param {SaveAndExitRecord} recordInput
 * @param {ClientSession} session
 * @returns {Promise<ObjectId>} newId
 */
export async function createSaveAndExitRecord(recordInput, session) {
  logger.info(`Inserting ${recordInput.magicLinkId}`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const res = await coll.insertOne(
      {
        ...recordInput,
        expireAt: addDays(new Date(), expiryInDays),
        invalidPasswordAttempts: 0,
        consumed: false
      },
      { session }
    )

    logger.info(`Inserted ${recordInput.magicLinkId}`)

    return res.insertedId
  } catch (err) {
    logger.error(
      err,
      `Failed to insert ${recordInput.magicLinkId} - ${getErrorMessage(err)} `
    )
    throw err
  }
}

/**
 * Increment invalid password attempts on a record based on magic link id
 * @param {string} id - magic link id
 * @returns { Promise<WithId<SaveAndExitDocument>> }
 */
export async function incrementInvalidPasswordAttempts(id) {
  logger.info('Increment invalid password attempts')

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOneAndUpdate(
      { magicLinkId: id },
      { $inc: { invalidPasswordAttempts: 1 } },
      { returnDocument: 'after' }
    )

    if (!result) {
      throw Boom.notFound(`Save and exit record ${id} not found`)
    }

    if (result.invalidPasswordAttempts >= maxInvalidPasswordAttempts) {
      logger.info(
        'Reached max number of invalid password - record being marked as consumed'
      )
      await markSaveAndExitRecordAsConsumed(id)
    }

    logger.info('Incremented invalid password attempts')

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to increment invalid password attempts - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Marks a save and exit record as consumed
 * @param {string} id - magic link id
 */
export async function markSaveAndExitRecordAsConsumed(id) {
  logger.info(`Marking ${id} as consumed`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    await coll.updateOne({ magicLinkId: id }, { $set: { consumed: true } })

    logger.info(`Marked ${id} as consumed`)
  } catch (err) {
    logger.error(
      err,
      `Failed to mark as consumed ${id} - ${getErrorMessage(err)} `
    )
    throw err
  }
}

/**
 * @import { SaveAndExitRecord } from '@defra/forms-model'
 * @import { ClientSession, Collection, ObjectId, WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 */
