/* eslint-disable no-console */

export const FILES_COLLECTION_NAME = 'files'
export const SAVE_AND_EXIT_COLLECTION_NAME = 'save-and-exit'
export const SUBMISSIONS_COLLECTION_NAME = 'submissions'

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

  console.log(
    `[INIT-MIG] Creating the ${FILES_COLLECTION_NAME} collection and indexes`
  )

  await filesColl.createIndex({ fileId: 1 }, { unique: true })

  console.log(
    `[INIT-MIG] Created the ${FILES_COLLECTION_NAME} collection and indexes`
  )

  /**
   * Initialise the `save-and-exit` collection and add indexes
   * @type {Collection<SaveAndExitDocument>}
   */
  const saveColl = db.collection(SAVE_AND_EXIT_COLLECTION_NAME)

  console.log(
    `[INIT-MIG] Creating the ${SAVE_AND_EXIT_COLLECTION_NAME} collection and indexes`
  )

  await saveColl.createIndex({ magicLinkId: 1 }, { unique: true })
  await saveColl.createIndex({ magicLinkGroupId: 1 })
  await saveColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL
  await saveColl.createIndex({
    'notify.expireEmailSentTimestamp': 1,
    expireAt: 1,
    consumed: 1
  })

  console.log(
    `[INIT-MIG] Created the ${SAVE_AND_EXIT_COLLECTION_NAME} collection and indexes`
  )

  /**
   * Initialise the `submissions` collection and add indexes
   * @type {Collection<FormSubmissionDocument>}
   */
  const submissionsColl = db.collection(SUBMISSIONS_COLLECTION_NAME)

  console.log(
    `[INIT-MIG] Creating the ${SUBMISSIONS_COLLECTION_NAME} collection and indexes`
  )

  await submissionsColl.createIndex({ 'meta.formId': 1 })
  await submissionsColl.createIndex({ 'meta.referenceNumber': 1 })
  await submissionsColl.createIndex({ 'meta.timestamp': -1 })
  await submissionsColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL

  console.log(
    `[INIT-MIG] Created the ${SUBMISSIONS_COLLECTION_NAME} collection and indexes`
  )
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

  /**
   * @type {Collection<FormSubmissionDocument>}
   */
  const submissionsColl = db.collection(SUBMISSIONS_COLLECTION_NAME)

  await submissionsColl.drop()
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormFileUploadStatus, FormSubmissionDocument, SaveAndExitDocument } from '~/src/api/types.js'
 */
