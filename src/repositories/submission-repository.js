import { getErrorMessage } from '@defra/forms-model'

import { logger } from '~/src/helpers/logging/logger.js'
import { SUBMISSIONS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { previewFilter } from '~/src/repositories/helpers.js'

/**
 * The collation of the user email index on the submissions collection. A query
 * must specify this collation to use the index, and the collation makes the
 * email match case-insensitive. It must stay the same as the collation in the
 * migration that creates the index.
 */
export const USER_EMAIL_COLLATION = { locale: 'en', strength: 2 }

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
 * @param { Filter<FormSubmissionDocument> | undefined } filter - additional properties by which to filter records e.g. 'welsh-submission'
 * @returns { FindCursor<WithId<FormSubmissionDocument>> }
 */
export function getSubmissionRecordsForDate(date, filter) {
  logger.info(`Reading submission records for date ${date.toISOString()}`)

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  const withoutTime = date.toISOString().substring(0, 10)
  const startOfDay = `${withoutTime}T00:00:00.000Z`
  const endOfDay = `${withoutTime}T23:59:59.999Z`
  const extraFilter = filter ?? {}
  try {
    const result = coll
      .find({
        'meta.timestamp': {
          $gte: new Date(startOfDay),
          $lte: new Date(endOfDay)
        },
        ...extraFilter
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
 * @param {CitizenCredentials} [citizenUser] - the citizen user
 * @returns { Promise<WithId<FormSubmissionDocument> | null> }
 */
export async function getSubmissionRecordByReference(
  referenceNumber,
  citizenUser
) {
  logger.info('Reading submission record')

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  try {
    const filter = {
      'meta.referenceNumber': referenceNumber
    }

    // If this is a citizen request then qualify
    // the query using their auth credentials
    if (citizenUser) {
      Object.assign(filter, {
        'meta.auth.sub': citizenUser.sub,
        'meta.auth.issuer': citizenUser.iss
      })
    }

    const result = await coll.findOne(filter)

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
 * Get all submission records for a user based on form ID
 * @param {string} sub - the user's subject identifier
 * @param {string} iss - the issuer of the token
 * @param {string} formId - the form ID
 * @param {FormStatus} [preview] - the preview state, or none for a live form
 * @returns { Promise<WithId<FormSubmissionDocument>[]> }
 */
export async function getSubmissionRecordsForUser(sub, iss, formId, preview) {
  logger.info('Reading user submission records')

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  try {
    const result = await coll
      .find({
        'meta.auth.sub': sub,
        'meta.auth.issuer': iss,
        'meta.formId': formId,
        ...previewFilter(preview, 'meta')
      })
      .toArray()

    logger.info('Read user submission records')

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
 * Links to the user's account the submissions of a form that have the user's
 * email as the confirmation email and are not yet linked to an account. The
 * email match is case-insensitive.
 * @param {string} sub - the user's subject identifier
 * @param {string} iss - the issuer of the token
 * @param {string} formId - the form ID
 * @param {string} email - the email of the user's account
 * @returns {Promise<number>} the number of submissions linked
 */
export async function linkSubmissionRecordsToUser(sub, iss, formId, email) {
  logger.debug('Linking submission records to user')

  const coll = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  try {
    const result = await coll.updateMany(
      {
        'meta.formId': formId,
        'meta.custom.userConfirmationEmail': email,
        // Matches a missing `meta.auth` too
        'meta.auth.sub': null
      },
      { $set: { 'meta.auth': { sub, issuer: iss } } },
      { collation: USER_EMAIL_COLLATION }
    )

    logger.info(
      `Linked ${result.modifiedCount} submission records to user for form ${formId}`
    )

    return result.modifiedCount
  } catch (err) {
    logger.error(
      err,
      `Failed to link submission records to user - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { FormStatus } from '@defra/forms-model'
 * @import { ClientSession, Filter, ObjectId, WithId, Collection, FindCursor } from 'mongodb'
 * @import { CitizenCredentials, FormSubmissionDocument } from '~/src/api/types.js'
 */
