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
 * @param {ClientSession} session
 */
export async function updateS3Key(fileId, s3Key, session) {
  return updateField([fileId], 's3Key', s3Key, session)
}

/**
 * Updates the retrievalKey for a given file ID.
 * @param {string[]} fileIds
 * @param {string} retrievalKey
 * @param {ClientSession} session
 */
export async function updateRetrievalKeys(fileIds, retrievalKey, session) {
  return updateField(fileIds, 'retrievalKey', retrievalKey, session)
}

/**
 * Updates a single field for a given file ID.
 * @param {string[]} fileIds
 * @param {string} fieldName
 * @param {string} fieldValue
 * @param {ClientSession} session
 */
async function updateField(fileIds, fieldName, fieldValue, session) {
  logger.info(`Updating ${fieldName} for ${fileIds.length} file IDs`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>} */ (
    db.collection(COLLECTION_NAME)
  )

  const result = await coll.updateMany(
    { fileId: { $in: fileIds } },
    {
      $set: {
        [fieldName]: fieldValue
      }
    },
    { session }
  )

  if (!result.acknowledged) {
    throw new Error(`Failed to update ${fieldName}`)
  }

  logger.info(`Updated ${fieldName} for ${fileIds.length} file IDs`)
}

/**
 * @template {object} Schema
 * @typedef {import('mongodb').Collection<Schema>} Collection
 */

/**
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 * @import { ClientSession } from 'mongodb'
 */
