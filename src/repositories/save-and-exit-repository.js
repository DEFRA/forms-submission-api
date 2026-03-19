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
 * @param {Omit<SaveAndExitDocument, 'expireAt'>} recordInput
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
 * Reset the save and exit link by setting the consumed
 * flag to false and invalidPasswordAttempts to zero
 * @param {string} id - magic link id
 */
export async function resetSaveAndExitRecord(id) {
  logger.info(`Resetting save and exit record ${id}`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.updateOne(
      { magicLinkId: id },
      { $set: { consumed: false, invalidPasswordAttempts: 0 } }
    )

    logger.info(
      `Reset save and exit record ${id} - modified ${result.modifiedCount} record`
    )

    return {
      recordFound: result.matchedCount === 1,
      recordUpdated: result.modifiedCount === 1
    }
  } catch (err) {
    logger.error(
      err,
      `Failed to reset save and exit record ${id} - ${getErrorMessage(err)} `
    )
    throw err
  }
}

/**
 * Marks a save and exit record as not consumed and sets the
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
 * Finds save-and-exit records that are about to expire within the specified hours
 * @param {number} expiryWindowInHours - Number of hours before expiry
 * @param {number} minimumHoursRemaining - Minimum hours that must remain before expiry
 * @param {number} [limit] - Maximum number of records to return
 * @returns {Promise<WithId<SaveAndExitDocument>[]>}
 */
export async function findExpiringRecords(
  expiryWindowInHours,
  minimumHoursRemaining = 2,
  limit
) {
  logger.info('Finding expiring save-and-exit records')

  const saveAndExitCollection = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const now = new Date()
    const expiryThreshold = new Date(
      now.getTime() + expiryWindowInHours * 60 * 60 * 1000
    )
    const minimumExpiryTime = new Date(
      now.getTime() + minimumHoursRemaining * 60 * 60 * 1000
    )
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    // Only return records that:
    // - Are about to expire within the next X hours.
    // - Have at least Y hours remaining before expiry.
    // - Haven't already been fully processed.
    // - Aren't currently being processed by another instance (locked within the last hour).
    let cursor = saveAndExitCollection.find({
      consumed: { $ne: true },
      expireAt: { $lte: expiryThreshold, $gt: minimumExpiryTime },
      'notify.expireEmailSentTimestamp': null,
      $or: [
        { 'notify.expireLockId': null },
        { 'notify.expireLockTimestamp': null },
        { 'notify.expireLockTimestamp': { $lt: oneHourAgo } }
      ]
    })

    if (limit) {
      cursor = cursor.limit(limit)
    }

    const results = await cursor.toArray()

    logger.info(`Found ${results.length} expiring save-and-exit records`)

    return results
  } catch (err) {
    logger.error(
      err,
      `Failed to find expiring save-and-exit records - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Locks a save-and-exit record for expiry email processing
 * @param {string} magicLinkId - The magic link ID
 * @param {string} runtimeId - The runtime ID to use as lock
 * @param {number|null} [currentVersion] - The current version of the record
 * @returns {Promise<WithId<SaveAndExitDocument> | null>}
 */
export async function lockRecordForExpiryEmail(
  magicLinkId,
  runtimeId,
  currentVersion
) {
  logger.info(`save-and-exit: Locking record ${magicLinkId} for expiry email`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOneAndUpdate(
      {
        magicLinkId,
        consumed: { $ne: true },
        version: currentVersion ?? { $exists: false },
        'notify.expireEmailSentTimestamp': null
      },
      {
        $set: {
          'notify.expireLockId': runtimeId,
          'notify.expireLockTimestamp': new Date()
        },
        $inc: { version: 1 }
      },
      { returnDocument: 'after' }
    )

    if (result) {
      logger.info(`save-and-exit: Successfully locked record ${magicLinkId}`)
    } else {
      logger.info(
        `save-and-exit: Failed to lock record ${magicLinkId} - already locked or processed`
      )
    }

    return result
  } catch (err) {
    logger.error(
      err,
      `save-and-exit: Failed to lock record ${magicLinkId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Updates a save-and-exit record to mark the expiry email as sent
 * @param {string} magicLinkId - The magic link ID
 * @param {string} runtimeId - The runtime ID that locked the record
 * @returns {Promise<WithId<SaveAndExitDocument> | null>}
 */
export async function markExpiryEmailSent(magicLinkId, runtimeId) {
  logger.info(`save-and-exit: Marking expiry email sent for ${magicLinkId}`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOneAndUpdate(
      {
        magicLinkId,
        'notify.expireLockId': runtimeId
      },
      {
        $set: {
          'notify.expireEmailSentTimestamp': new Date()
        },
        $inc: { version: 1 }
      },
      { returnDocument: 'after' }
    )

    if (result) {
      logger.info(`save-and-exit: Marked expiry email sent for ${magicLinkId}`)
    } else {
      logger.warn(
        `save-and-exit: Failed to mark expiry email sent for ${magicLinkId} - lock mismatch`
      )
    }

    return result
  } catch (err) {
    logger.error(
      err,
      `save-and-exit: Failed to mark expiry email sent for ${magicLinkId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession, Collection, ObjectId, WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 */
