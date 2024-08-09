import { createLogger } from '~/src/helpers/logging/logger.js'
import { db, COLLECTION_NAME } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Adds a file status to the database
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
 * Retrieves a file status
 * @param {string} fileId
 * @returns {Promise<FormFileUploadStatus | null>}
 */
export async function getByFileId(fileId) {
  logger.info(`Retrieving file status for file ID ${fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>}>} */ (
    db.collection(COLLECTION_NAME)
  )

  const value = coll.findOne({ fileId })

  logger.info(`Found file status for file ID ${fileId}`)

  return value
}

/**
 * @template {object} Schema
 * @typedef {import('mongodb').Collection<Schema>} Collection
 */

/**
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 */
