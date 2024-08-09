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
 * Updates the S3 Key for a given file ID.
 * @param {string} fileId
 * @param {string} s3Key
 */
export async function updateS3Key(fileId, s3Key) {
  return updateField(fileId, 's3Key', s3Key)
}

/**
 * Updates the retrievalKey for a given file ID.
 * @param {string} fileId
 * @param {string} retrievalKey
 */
export async function updateRetrievalKey(fileId, retrievalKey) {
  return updateField(fileId, 'retrievalKey', retrievalKey)
}

/**
 * Updates a single field for a given file ID.
 * @param {string} fileId
 * @param {string} fieldName
 * @param {string} fieldValue
 */
async function updateField(fileId, fieldName, fieldValue) {
  logger.info(`Updating ${fieldName} for file ID ${fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>} */ (
    db.collection(COLLECTION_NAME)
  )

  const result = await coll.updateOne(
    { fileId },
    {
      $set: {
        [fieldName]: fieldValue
      }
    }
  )

  if (result.modifiedCount !== 1) {
    throw new Error(`Failed to update ${fieldName}`)
  }

  logger.info(`Updated ${fieldName} for file ID ${fileId}`)
}

/**
 * @template {object} Schema
 * @typedef {import('mongodb').Collection<Schema>} Collection
 */

/**
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 */
