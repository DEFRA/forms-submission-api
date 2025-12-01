import { getErrorMessage } from '@defra/forms-model'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { SUBMISSIONS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()
const SUBMISSION_RECORDS_LIMIT = 2000

/**
 * Gets submission records based on formId
 * @param {string} formId - the form id
 * @param {number} [limit] - the max number of records to return
 * @returns { Promise<WithId<FormSubmissionDocument>[]> }
 */
export async function getSubmissionRecords(
  formId,
  limit = SUBMISSION_RECORDS_LIMIT
) {
  logger.info('Reading submission records')

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  try {
    const result = await coll
      .find({ 'meta.formId': formId })
      .limit(Math.max(SUBMISSION_RECORDS_LIMIT, limit))
      .toArray()

    logger.info('Read submission records')

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to read submission records - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Creates a form submission record
 * @param {FormSubmissionDocument} document
 * @param {ClientSession} session
 * @returns {Promise<ObjectId>} newId
 */
export async function createSubmissionRecord(document, session) {
  logger.info(`Inserting submission ${document.meta.referenceNumber}`)

  try {
    const coll = /** @type {Collection<FormSubmissionDocument>} */ (
      db.collection(SUBMISSIONS_COLLECTION_NAME)
    )
    const res = await coll.insertOne(document, { session })

    logger.info(
      `Inserted submission ${document.meta.referenceNumber} as ${res.insertedId.toString()}`
    )

    return res.insertedId
  } catch (err) {
    logger.error(
      err,
      `Failed to insert submission record - ${getErrorMessage(err)} `
    )
    throw err
  }
}

/**
 * @import { ClientSession, ObjectId, WithId, Collection } from 'mongodb'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
