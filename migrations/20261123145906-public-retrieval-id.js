/* eslint-disable no-console */

export const SUBMISSIONS_COLLECTION_NAME = 'submissions'

/**
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  console.log(
    `[PUBLIC-RETRIEVAL-ID] Adding public retrieval ID to the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  await submissionsColl.updateMany({}, [
    {
      $set: {
        publicRetrievalId: { $toString: '$_id' }
      }
    }
  ])

  console.log(
    `[PUBLIC-RETRIEVAL-ID] Added public retrieval ID to the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  console.log(
    `[PUBLIC-RETRIEVAL-ID] Adding public retrieval ID index to the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  await submissionsColl.createIndex({ publicRetrievalId: 1 }, { unique: true })

  console.log(
    `[PUBLIC-RETRIEVAL-ID] Added public retrieval ID index to the ${SUBMISSIONS_COLLECTION_NAME} collection`
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
