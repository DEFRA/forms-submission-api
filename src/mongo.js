import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

export const FILES_COLLECTION_NAME = 'files'
export const SAVE_AND_EXIT_COLLECTION_NAME = 'save-and-exit'

/**
 * @type {Db}
 */
export let db

/**
 * @type {MongoClient}
 */
export let client

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

  /**
   * @type {Collection<FormFileUploadStatus>}
   */
  const filesColl = db.collection(FILES_COLLECTION_NAME)

  await filesColl.createIndex({ fileId: 1 }, { unique: true })

  /**
   * @type {Collection<SaveAndExit>}
   */
  const saveColl = db.collection(SAVE_AND_EXIT_COLLECTION_NAME)

  await saveColl.createIndex({ magicLinkId: 1 }, { unique: true })
  await saveColl.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }) // enables TTL

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus, SaveAndExit } from '~/src/api/types.js'
 */
