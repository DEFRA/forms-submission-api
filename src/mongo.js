import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'

export const COLLECTION_NAME = 'file-upload-status'

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

  logger.info('Setting up mongodb')

  client = new MongoClient(mongoUri)
  await client.connect()

  db = client.db(databaseName)

  /**
   * @type {Collection<FormFileUploadStatus>}
   */
  const coll = db.collection(COLLECTION_NAME)

  await coll.createIndex({ fileId: 1 }, { unique: true })

  logger.info(`Mongodb connected to ${databaseName}`)
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus } from '~/src/api/types.js'
 */
