import { getErrorMessage } from '@defra/forms-model'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { submissionsColl } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Gets a record based on id
 * @param {string} id
 * @returns { Promise<WithId<FormSubmissionDocument> | null> }
 */
export async function getSubmissionRecord(id) {
  logger.info('Reading submission record')

  try {
    const result = await submissionsColl.findOne({ magicLinkId: id })

    logger.info('Read submission record')

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
  // todo: unique ref
  logger.info(`Inserting submission ${document.meta.referenceNumber}`)

  try {
    const res = await submissionsColl.insertOne(document, { session })

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
 * @import { ClientSession, ObjectId, WithId } from 'mongodb'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
