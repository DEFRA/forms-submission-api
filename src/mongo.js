import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

export const COLLECTION_NAME = 'files'

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
  const coll = db.collection(COLLECTION_NAME)

  await coll.createIndex({ fileId: 1 }, { unique: true })

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 */
