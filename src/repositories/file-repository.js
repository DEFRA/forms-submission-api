import { createLogger } from '~/src/helpers/logging/logger.js'
import { FILES_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Adds a file status to the database
 * @param {FormFileUploadStatus} fileStatus - file status
 */
export async function create(fileStatus) {
  logger.info(`Creating file status for file ID ${fileStatus.fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>}>} */ (
    db.collection(FILES_COLLECTION_NAME)
  )

  await coll.insertOne(fileStatus)

  logger.info(`Created file status for file ID ${fileStatus.fileId}`)
}

/**
 * Retrieves a file status
 * @param {string} fileId
 * @returns {Promise<FormFileUploadStatusRecord | null>}
 */
export async function getByFileId(fileId) {
  logger.info(`Retrieving file status for file ID ${fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatusRecord>}>} */ (
    db.collection(FILES_COLLECTION_NAME)
  )

  let value = await coll.findOne({ fileId })

  // If not found in the correct collection, try the incorrect collection
  if (!value) {
    logger.info(
      `File ID ${fileId} not found in '${FILES_COLLECTION_NAME}' collection, checking 'file-upload-status' collection`
    )

    const fallbackColl =
      /** @satisfies {Collection<FormFileUploadStatusRecord>}>} */ (
        db.collection('file-upload-status')
      )

    value = await fallbackColl.findOne({ fileId })

    if (value) {
      logger.info(
        `Found file status for file ID ${fileId} in 'file-upload-status' collection`
      )
    }
  } else {
    logger.info(
      `Found file status for file ID ${fileId} in '${FILES_COLLECTION_NAME}' collection`
    )
  }

  return value
}

/**
 * Updates the S3 Keys for a given set of files
 * @param {{ fileId: string; s3Bucket: string; oldS3Key: string; newS3Key: string; }[]} updateFiles
 * @param {ClientSession} session
 */
export async function updateS3Keys(updateFiles, session) {
  const ops = updateFiles.map(({ fileId, newS3Key: s3Key }) => {
    return {
      updateOne: {
        filter: { fileId },
        update: [{ $set: { s3Key } }]
      }
    }
  })

  const coll = /** @satisfies {Collection<FormFileUploadStatus>} */ (
    db.collection(FILES_COLLECTION_NAME)
  )

  return coll.bulkWrite(ops, { session })
}

/**
 * Updates the retrievalKey and retrievalKeyIsCaseSensitive for given file IDs.
 * @param {string[]} fileIds
 * @param {string} retrievalKey
 * @param {boolean} retrievalKeyIsCaseSensitive
 * @param {ClientSession} session
 */
export async function updateRetrievalKeys(
  fileIds,
  retrievalKey,
  retrievalKeyIsCaseSensitive,
  session
) {
  return updateFields(
    fileIds,
    { retrievalKey, retrievalKeyIsCaseSensitive },
    session
  )
}

/**
 * Updates multiple fields for given file IDs.
 * @param {string[]} fileIds
 * @param {Partial<FormFileUploadStatus>} fieldsToUpdate
 * @param {ClientSession} session
 */
async function updateFields(fileIds, fieldsToUpdate, session) {
  const fieldNames = Object.keys(fieldsToUpdate).join(', ')
  logger.info(`Updating ${fieldNames} for ${fileIds.length} file IDs`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>} */ (
    db.collection(FILES_COLLECTION_NAME)
  )

  const result = await coll.updateMany(
    { fileId: { $in: fileIds } },
    {
      $set: fieldsToUpdate
    },
    { session }
  )

  if (!result.acknowledged) {
    const error = new Error(`Failed to update ${fieldNames}`)
    logger.error(
      error,
      `[mongodbUpdateFailure] Failed to update ${fieldNames} for ${fileIds.length} files - result not acknowledged`
    )

    throw error
  }

  logger.info(`Updated ${fieldNames} for ${fileIds.length} file IDs`)
}

/**
 * @import { FormFileUploadStatus, FormFileUploadStatusRecord } from '~/src/api/types.js'
 * @import { ClientSession, Collection } from 'mongodb'
 */
