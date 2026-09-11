/* eslint-disable no-console */

export const SAVE_AND_EXIT_COLLECTION_NAME = 'save-and-exit'

const INDEX_NAME = 'auth.issuer_1_auth.sub_1_form.id_1_expireAt_1'

/**
 * Serves the query behind the citizen's homepage: the records of one citizen
 * for one form, soonest to expire first. The sort field comes last, so the
 * sort reads the index instead of being done in memory.
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  const saveColl = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  console.log(
    `[CITIZEN-MIG] Creating the citizen index on ${SAVE_AND_EXIT_COLLECTION_NAME}`
  )

  await saveColl.createIndex({
    'auth.issuer': 1,
    'auth.sub': 1,
    'form.id': 1,
    expireAt: 1
  })

  console.log(
    `[CITIZEN-MIG] Created the citizen index on ${SAVE_AND_EXIT_COLLECTION_NAME}`
  )
}

/**
 * @param {Db} db - the Mongo Db instance
 */
export const down = async (db) => {
  const saveColl = /** @type {Collection<SaveAndExitDocument>} */ (
    db.collection(SAVE_AND_EXIT_COLLECTION_NAME)
  )

  await saveColl.dropIndex(INDEX_NAME)
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 */
