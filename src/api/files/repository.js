import { createLogger } from '~/src/helpers/logging/logger.js'
import { db, COLLECTION_NAME } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Adds a form to the Form Store
 * @param {FormFileUploadStatus} fileStatus - file status
 */
export async function create(fileStatus) {
  logger.info(`Creating file status for file ID ${fileStatus.fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>}>} */ (
    db.collection(COLLECTION_NAME)
  )

  await coll.insertOne(fileStatus)

  logger.info(`Created file status for file ID ${fileStatus.fileId}`)
}

/**
 * Retrieves a file for a given form
 * @param {string} fileId
 * @returns {Promise<FormFileUploadStatus | null>}
 */
export async function get(fileId) {
  logger.info(`Getting file status for file ID ${fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>} */ (
    db.collection(COLLECTION_NAME)
  )

  const fileStatus = await coll.findOne({ fileId })

  logger.info(`Got file for file ID ${fileId}`)

  return fileStatus
}

/**
 * @template {object} Schema
 * @typedef {import('mongodb').Collection<Schema>} Collection
 */

/**
 * @import { FormFileUploadStatus } from '../types.js'
 * @import { WithId } from 'mongodb'
 */
