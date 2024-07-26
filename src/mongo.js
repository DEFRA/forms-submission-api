import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

const mongoUrl = config.get('mongoUri')
const databaseName = config.get('mongoDatabase')

/**
 * @type {Db}
 */
export let db

/**
 * @type {MongoClient}
 */
export let client

export const METADATA_COLLECTION_NAME = 'form-metadata'
export const DEFINITION_COLLECTION_NAME = 'form-definition'

/**
 * Prepare the database and establish a connection
 * @param {Logger} logger - Logger instance
 */
export async function prepareDb(logger) {
  logger.info('Setting up mongodb')

  // Create the mongodb client
  client = await MongoClient.connect(mongoUrl, {
    retryWrites: false,
    readPreference: 'secondary',
    secureContext
  })

  // Create the db instance
  db = client.db(databaseName)

  // Ensure db indexes
  const coll = db.collection(METADATA_COLLECTION_NAME)

  await coll.createIndex({ title: 1 })
  await coll.createIndex({ slug: 1 }, { unique: true })

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @typedef {import('mongodb').Db} Db
 * @typedef {import('pino').Logger} Logger
 */
