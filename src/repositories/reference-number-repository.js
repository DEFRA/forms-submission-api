import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { addMonths } from 'date-fns'

import { MONGO_DUPLICATE_KEY_ERROR } from '~/src/constants.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { REFERENCE_NUMBERS_COLLECTION_NAME, db } from '~/src/mongo.js'

/**
 * Create a unique submission reference number
 * @param {string} [prefix] - Reference number prefix
 */
export async function create(prefix) {
  logger.info('Creating reference number record')

  const coll =
    /** @type {Collection<FormSubmissionReferenceNumberDocument>} */ (
      db.collection(REFERENCE_NUMBERS_COLLECTION_NAME)
    )

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const referenceNumber = generateUniqueReference(prefix)

    try {
      const months = 18
      const expireAt = addMonths(new Date(), months)

      await coll.insertOne({ referenceNumber, expireAt })

      logger.info('Created reference number record')

      return { referenceNumber }
    } catch (/** @type {any} */ err) {
      if (err.code !== MONGO_DUPLICATE_KEY_ERROR) {
        throw err
      }

      logger.info(
        `Reference number collision occurred for ${referenceNumber}, generating a new one`
      )
    }
    // Collision occurred - generate another one and try again
  }
}

/**
 * Updates a unique submission reference number with an associated submission Id
 * @param {string} referenceNumber - the reference number
 * @param {ObjectId} submissionId - the submission id
 * @param {ClientSession} session - the mongo session
 */
export async function updateWithSubmissionId(
  referenceNumber,
  submissionId,
  session
) {
  logger.info(
    `Updating reference number record ${referenceNumber} with submission id ${submissionId.toString()}`
  )

  const coll =
    /** @type {Collection<FormSubmissionReferenceNumberDocument>} */ (
      db.collection(REFERENCE_NUMBERS_COLLECTION_NAME)
    )

  // Set the submissionId and unset the expireAt
  const updateResult = await coll.updateOne(
    { referenceNumber },
    { $set: { submissionId }, $unset: { expireAt: '' } },
    { session }
  )

  logger.info(
    `Updated reference number record ${referenceNumber} with submission id ${submissionId.toString()}`
  )

  return updateResult.modifiedCount === 1
}

/**
 * @import { ClientSession, Collection, ObjectId } from 'mongodb'
 * @import { FormSubmissionReferenceNumberDocument } from '~/src/api/types.js'
 */
