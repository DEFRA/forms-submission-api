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
 * Gets a record based on id
 * @param {string} id
 * @returns { Promise<WithId<SaveAndExitDocument> | null> }
 */
export async function getSaveAndExitRecord(id) {
  logger.info('Reading save and exit record')

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

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
 * Finds save-and-exit records that are about to expire within the specified hours
 * @param {number} expiryWindowInHours - Number of hours before expiry
 * @param {number} minimumHoursRemaining - Minimum hours that must remain before expiry
 * @returns {Promise<WithId<SaveAndExitDocument>[]>}
 */
export async function findExpiringRecords(
  expiryWindowInHours,
  minimumHoursRemaining = 2
) {
  logger.info('Finding expiring save and exit records')

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
    const results = await saveAndExitCollection
      .find({
        expireAt: { $lte: expiryThreshold, $gt: minimumExpiryTime },
        $or: [
          { 'notify.expireEmailSentTimestamp': null },
          { 'notify.expireEmailSentTimestamp': { $exists: false } }
        ],
        $and: [
          {
            $or: [
              { 'notify.expireLockId': null },
              { 'notify.expireLockId': { $exists: false } },
              {
                $and: [
                  { 'notify.expireLockId': { $ne: null } },
                  {
                    $or: [
                      { 'notify.expireLockTimestamp': null },
                      { 'notify.expireLockTimestamp': { $exists: false } },
                      { 'notify.expireLockTimestamp': { $lt: oneHourAgo } }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })
      .toArray()

    logger.info(`Found ${results.length} expiring save and exit records`)

    return results
  } catch (err) {
    logger.error(
      err,
      `Failed to find expiring save and exit records - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Locks a save-and-exit record for expiry email processing
 * @param {string} magicLinkId - The magic link ID
 * @param {string} runtimeId - The runtime ID to use as lock
 * @param {number} currentVersion - The current version of the record
 * @returns {Promise<WithId<SaveAndExitDocument> | null>}
 */
export async function lockRecordForExpiryEmail(
  magicLinkId,
  runtimeId,
  currentVersion
) {
  logger.info(`Locking save and exit record ${magicLinkId} for expiry email`)

  const coll = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOneAndUpdate(
      {
        magicLinkId,
        version: currentVersion,
        $or: [
          { 'notify.expireEmailSentTimestamp': null },
          { 'notify.expireEmailSentTimestamp': { $exists: false } }
        ]
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
      logger.info(`Successfully locked save and exit record ${magicLinkId}`)
    } else {
      logger.info(
        `Failed to lock save and exit record ${magicLinkId} - already locked or processed`
      )
    }

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to lock save and exit record ${magicLinkId} - ${getErrorMessage(err)}`
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
  logger.info(`Marking expiry email sent for ${magicLinkId}`)

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
        }
      },
      { returnDocument: 'after' }
    )

    if (result) {
      logger.info(`Marked expiry email sent for ${magicLinkId}`)
    } else {
      logger.warn(
        `Failed to mark expiry email sent for ${magicLinkId} - lock mismatch`
      )
    }

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to mark expiry email sent for ${magicLinkId} - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession, Collection, ObjectId, WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 */
