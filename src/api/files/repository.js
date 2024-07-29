import { ObjectId } from 'mongodb'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { db, COLLECTION_NAME } from '~/src/mongo.js'

const logger = createLogger()

/**
 * Adds a form to the Form Store
 * @param {import('../types.js').FormFileUploadStatus} fileStatus - file status
 */
export async function create(fileStatus) {
  logger.info(`Creating file status for file ID ${fileStatus.fileId}`)

  const coll = /** @satisfies {Collection<FormFileUploadStatus>}>} */ (
    db.collection(COLLECTION_NAME)
  )

  const _id = new ObjectId()
  await coll.updateOne({ _id }, { $set: fileStatus })

  logger.info(`Created file status for file ID ${fileStatus.fileId}`)
}

/**
 * @template {object} Schema
 * @typedef {import('mongodb').Collection<Schema>} Collection
 */

/**
 * @typedef {import('mongodb').ClientSession} ClientSession
 */

/**
 * @import { FormFileUploadStatus } from '../types.js'
 */
