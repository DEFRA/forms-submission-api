import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

export const FILES_COLLECTION_NAME = 'files'
export const SAVE_AND_EXIT_COLLECTION_NAME = 'save-and-exit'
export const SUBMISSIONS_COLLECTION_NAME = 'submissions'
export const REFERENCE_NUMBERS_COLLECTION_NAME = 'reference-numbers'

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

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Logger } from 'pino'
 * @import { FormFileUploadStatus, SaveAndExitDocument, FormSubmissionDocument, FormSubmissionReferenceNumberDocument } from '~/src/api/types.js'
 */
