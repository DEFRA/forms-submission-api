/* eslint-disable no-console */

export const SUBMISSIONS_COLLECTION_NAME = 'submissions'
export const SAVE_AND_EXIT_COLLECTION_NAME = 'save-and-exit'

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
    `[CITIZEN-MIG] Re-ordering the citizen index on ${SAVE_AND_EXIT_COLLECTION_NAME}`
  )

  await saveColl.dropIndex('auth.issuer_1_auth.sub_1_form.id_1_expireAt_1')

  await saveColl.createIndex({
    'auth.sub': 1,
    'auth.issuer': 1,
    'form.id': 1,
    expireAt: 1
  })

  console.log(
    `[CITIZEN-MIG] Re-ordered the citizen index on ${SAVE_AND_EXIT_COLLECTION_NAME}`
  )

  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  console.log(
    `[CITIZEN-MIG] Creating the citizen index on ${SUBMISSIONS_COLLECTION_NAME}`
  )

  await submissionsColl.createIndex({
    'meta.auth.sub': 1,
    'meta.auth.issuer': 1,
    'meta.formId': 1,
    expireAt: 1
  })

  console.log(
    `[CITIZEN-MIG] Created the citizen index on ${SUBMISSIONS_COLLECTION_NAME}`
  )
}

/**
 * Rollback migration (not implemented)
 * @returns {Promise<void>}
 */
export function down() {
  return Promise.reject(
    new Error('Migration rollback is not supported for data safety reasons')
  )
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormSubmissionDocument, SaveAndExitDocument } from '~/src/api/types.js'
 */
