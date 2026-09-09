import {
  FILES_COLLECTION_NAME,
  SAVE_AND_EXIT_COLLECTION_NAME,
  SUBMISSIONS_COLLECTION_NAME
} from '~/src/mongo.js'

/**
 * Initial migration to create the `files`, `submissions`
 * and `save-and-exit` collections and add indexes
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  /**
   * Initialise the `files` collection and add indexes
   * @type {Collection<FormFileUploadStatus>}
   */
  const filesColl = db.collection(FILES_COLLECTION_NAME)

  await filesColl.createIndex({ fileId: 1 }, { unique: true })

  /**
   * Initialise the `save-and-exit` collection and add indexes
   * @type {Collection<SaveAndExitDocument>}
   */
  const saveColl = db.collection(SAVE_AND_EXIT_COLLECTION_NAME)

  await saveColl.createIndex({ magicLinkId: 1 }, { unique: true })
  await saveColl.createIndex({ magicLinkGroupId: 1 })
  await saveColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL
  await saveColl.createIndex({
    'notify.expireEmailSentTimestamp': 1,
    expireAt: 1,
    consumed: 1
  })

  /**
   * Initialise the `submissions` collection and add indexes
   * @type {Collection<FormSubmissionDocument>}
   */
  const submissionsColl = db.collection(SUBMISSIONS_COLLECTION_NAME)

  await submissionsColl.createIndex({ 'meta.formId': 1 })
  await submissionsColl.createIndex({ 'meta.referenceNumber': 1 })
  await submissionsColl.createIndex({ 'meta.timestamp': -1 })
  await submissionsColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL
}

/**
 * Drop the initial collections
 * @param {Db} db - the Mongo Db instance
 */
export const down = async (db) => {
  /**
   * @type {Collection<FormFileUploadStatus>}
   */
  const filesColl = db.collection(FILES_COLLECTION_NAME)

  await filesColl.drop()

  /**
   * @type {Collection<SaveAndExitDocument>}
   */
  const saveColl = db.collection(SAVE_AND_EXIT_COLLECTION_NAME)

  await saveColl.drop()

  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  await submissionsColl.drop()
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormFileUploadStatus, FormSubmissionDocument, SaveAndExitDocument } from '~/src/api/types.js'
 */
