import { getErrorMessage } from '@defra/forms-model'

import { logger } from '~/src/helpers/logging/logger.js'
import { SUBMISSIONS_COLLECTION_NAME, db } from '~/src/mongo.js'

/**
 * Gets submission records based on formId
 * @param {string} formId - the form id
 * @param {object} [filter] - restrict records returned (say by submitted form id)
 * @returns { FindCursor<WithId<FormSubmissionDocument>> }
 */
export function getSubmissionRecords(formId, filter) {
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
 * Gets all submission records for a single day
 * @param {Date} date - the specified day
 * @returns { FindCursor<WithId<FormSubmissionDocument>> }
 */
export function getSubmissionRecordsForDate(date) {
  logger.info(`Reading submission records for date ${date.toISOString()}`)

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  const withoutTime = date.toISOString().substring(0, 10)
  const startOfDay = `${withoutTime}T00:00:00.000Z`
  const endOfDay = `${withoutTime}T23:59:59.999Z`
  try {
    const result = coll
      .find({
        'meta.timestamp': {
          $gte: new Date(startOfDay),
          $lte: new Date(endOfDay)
        }
      })
      .sort('meta.timestamp', 'desc')

    logger.info(`Read submission records for date ${date.toISOString()}`)

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to read submission records for date ${date.toISOString()} - ${getErrorMessage(err)}`
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
 * Gets a submission record based on reference number
 * @param {string} referenceNumber - the reference number
 * @returns { Promise<WithId<FormSubmissionDocument> | null> }
 */
export async function getSubmissionRecordByReference(referenceNumber) {
  logger.info('Reading submission record')

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  try {
    const result = await coll.findOne({
      'meta.referenceNumber': referenceNumber
    })

    logger.info('Read submission record')

    return result
  } catch (err) {
    logger.error(
      err,
      `Failed to read submission record - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { ClientSession, ObjectId, WithId, Collection, FindCursor } from 'mongodb'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
