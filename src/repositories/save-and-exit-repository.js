import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'
import { addDays } from '~/src/helpers/date-helper.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  SAVE_AND_EXIT_COLLECTION_NAME,
  db,
  saveAndExitColl as coll
} from '~/src/mongo.js'

const logger = createLogger()
const expiryInDays = config.get('saveAndExitExpiryInDays')
const maxInvalidPasswordAttempts = 5

/**
 * Gets a record based on id
 * @param {string} id
 * @returns { Promise<WithId<SaveAndExitDocument> | null> }
 */
export async function getSaveAndExitRecord(id) {
  logger.info('Reading save and exit record')

  try {
    const result = await coll.findOne({ magicLinkId: id })

    logger.info('Read save and exit record')

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to read save and exit records - ${getErrorMessage(err)}`
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

  try {
    const res = await coll.insertOne(
      {
        ...recordInput,
        expireAt: addDays(new Date(), expiryInDays),
        invalidPasswordAttempts: 0
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
 * Increment invalid password attempts on a record based on id
 * @param {string} id
 * @returns { Promise<WithId<SaveAndExitDocument>> }
 */
export async function incrementInvalidPasswordAttempts(id) {
  logger.info('Increment invalid password attempts')

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
        'Reached max number of invalid password - record being deleted'
      )
      await coll.deleteOne({ magicLinkId: id })
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
 * Deletes a save and exit record
 * @param {string} id - message id/magic link id
 */
export async function deleteSaveAndExitRecord(id) {
  logger.info(`Deleting ${id}`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    await coll.deleteOne({ magicLinkId: id })

    logger.info(`Deleted ${id}`)
  } catch (err) {
    logger.error(err, `Failed to delete ${id} - ${getErrorMessage(err)} `)
    throw err
  }
}

/**
 * @import { SaveAndExitRecord } from '@defra/forms-model'
 * @import { ClientSession, Collection, ObjectId, WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 */
