import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

export const FILES_COLLECTION_NAME = 'files'
export const SAVE_AND_EXIT_COLLECTION_NAME = 'save-and-exit'
export const SUBMISSIONS_COLLECTION_NAME = 'submissions'

/**
 * @type {Db}
 */
export let db

/**
 * @type {MongoClient}
 */
export let client

/**
 * @type {Collection<FormFileUploadStatus>}
 */
export let filesColl

/**
 * @type {Collection<SaveAndExitDocument>}
 */
export let saveAndExitColl

/**
 * @type {Collection<FormSubmissionDocument>}
 */
export let submissionsColl

/**
 * Connects to mongo database
 * @param {Logger} logger
 */
export async function prepareDb(logger) {
  const mongoUri = config.get('mongo.uri')
  const databaseName = config.get('mongo.databaseName')
  const isSecureContextEnabled = config.get('isSecureContextEnabled')

  logger.info('Setting up mongodb')

  client = await MongoClient.connect(
    mongoUri,
    /** @type {any} */ ({
      retryWrites: false,
      readPreference: 'secondary',
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- secureContext can be undefined in non-production
      ...(isSecureContextEnabled && secureContext && { secureContext })
    })
  )

  db = client.db(databaseName)

  filesColl = db.collection(FILES_COLLECTION_NAME)
  await filesColl.createIndex({ fileId: 1 }, { unique: true })

  saveAndExitColl = db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  await saveAndExitColl.createIndex({ magicLinkId: 1 }, { unique: true })
  await saveAndExitColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL

  submissionsColl = db.collection(SUBMISSIONS_COLLECTION_NAME)
  // TODO: DS - add any indexes or TTL
  // await saveColl.createIndex({ 'meta.referenceNumber': 1 }, { unique: true })
  // await saveColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL

  /**
   * @type {Collection<FormSubmissionDocument>}
   */
  const submissionsColl = db.collection(SUBMISSIONS_COLLECTION_NAME)
  await submissionsColl.createIndex({ 'meta.formId': 1 })
  await submissionsColl.createIndex({ 'meta.referenceNumber': 1 })
  await submissionsColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus, SaveAndExitDocument, FormSubmissionDocument } from '~/src/api/types.js'
 */
