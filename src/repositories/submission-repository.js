import { getErrorMessage } from '@defra/forms-model'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { SUBMISSIONS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Gets submission records based on formId
 * @param {string} formId - the form id
 * @param {object} [filter] - restrict records returned (say by submitted form id)
 * @returns { FindCursor<WithId<FormSubmissionDocument>> }
 */
export function getSubmissionRecords(formId, filter = undefined) {
  logger.info('Reading submission records')

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  const findQuery = filter
    ? { 'meta.formId': formId, ...filter }
    : { 'meta.formId': formId }
  try {
    const result = coll.find(findQuery).sort('meta.timestamp', 'desc')

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
 * @import { ClientSession, ObjectId, WithId, Collection, FindCursor } from 'mongodb'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
