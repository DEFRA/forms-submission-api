/* eslint-disable no-console */

export const SUBMISSIONS_COLLECTION_NAME = 'submissions'
export const USER_EMAIL_INDEX_NAME =
  'meta.formId_1_meta.custom.userConfirmationEmail_1_meta.auth.sub_1_ci'

/**
 * Collation the index is built with. Queries must specify this same collation
 * to use the index and to match the email case-insensitively.
 */
export const USER_EMAIL_INDEX_COLLATION = { locale: 'en', strength: 2 }

/**
 * Serves lookups of the submissions for one form by the user's confirmation
 * email, such as finding the submissions not yet linked to an account. The
 * index uses a case-insensitive collation and only covers submissions where
 * the email is a non-empty string. `meta.auth.sub` lets a query check whether
 * a submission is linked to an account without reading the document.
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  console.log(
    `[USER-EMAIL-MIG] Creating the user email index on ${SUBMISSIONS_COLLECTION_NAME}`
  )

  await submissionsColl.createIndex(
    {
      'meta.formId': 1,
      'meta.custom.userConfirmationEmail': 1,
      'meta.auth.sub': 1
    },
    {
      name: USER_EMAIL_INDEX_NAME,
      collation: USER_EMAIL_INDEX_COLLATION,
      // `$gt: ''` only matches strings, so this excludes documents where the
      // field is missing, null, not a string or an empty string
      partialFilterExpression: {
        'meta.custom.userConfirmationEmail': { $gt: '' }
      }
    }
  )

  console.log(
    `[USER-EMAIL-MIG] Created the user email index on ${SUBMISSIONS_COLLECTION_NAME}`
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
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
