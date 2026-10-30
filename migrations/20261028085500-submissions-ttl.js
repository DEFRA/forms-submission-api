/* eslint-disable no-console */

export const SUBMISSIONS_COLLECTION_NAME = 'submissions'

/**
 * Extends the TTL (expireAt) for submissions by 18 months from record creation date,
 * if not already at that duration.
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  console.log(
    `[SUBMISSIONS-TTL] Extending TTL on ${SUBMISSIONS_COLLECTION_NAME}`
  )

  const { modifiedCount } = await submissionsColl.updateMany(
    {
      $expr: {
        $lt: [
          '$expireAt',
          {
            $dateAdd: {
              startDate: '$recordCreatedAt',
              unit: 'month',
              amount: 18
            }
          }
        ]
      }
    },
    [
      {
        $set: {
          expireAt: {
            $dateAdd: {
              startDate: '$recordCreatedAt',
              unit: 'month',
              amount: 18
            }
          }
        }
      }
    ]
  )

  console.log(
    `[SUBMISSIONS-TTL] Modified ${modifiedCount} documents in ${SUBMISSIONS_COLLECTION_NAME}`
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
