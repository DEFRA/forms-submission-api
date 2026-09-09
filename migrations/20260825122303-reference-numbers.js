/* eslint-disable no-console */

export const SUBMISSIONS_COLLECTION_NAME = 'submissions'
export const REFERENCE_NUMBERS_COLLECTION_NAME = 'reference-numbers'

/**
 * Create the new `reference-numbers` collection and seed it
 * with all the reference numbers from the submissions collection
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  const referenceNumbersColl =
    /** @type {Collection<FormSubmissionReferenceNumberDocument>} */ (
      db.collection(REFERENCE_NUMBERS_COLLECTION_NAME)
    )

  console.log(
    `[REF-MIG] Checking for duplicate reference numbers in the existing ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  const duplicates = await submissionsColl
    .aggregate([
      { $group: { _id: '$meta.referenceNumber', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 100 }
    ])
    .toArray()

  if (duplicates.length > 0) {
    const sample = duplicates.map((duplicate) => duplicate._id).join(', ')

    throw new Error(
      `[REF-MIG] Found duplicate reference numbers in ${SUBMISSIONS_COLLECTION_NAME} collection, aborting migration before any changes are made. Sample (up to 100): ${sample}`
    )
  }

  console.log(
    `[REF-MIG] No duplicate reference numbers found in ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  console.log(
    `[REF-MIG] Adding records into ${REFERENCE_NUMBERS_COLLECTION_NAME} collection from the existing ${SUBMISSIONS_COLLECTION_NAME} collection via aggregation pipeline`
  )

  await submissionsColl
    .aggregate([
      {
        $project: {
          _id: 0,
          referenceNumber: '$meta.referenceNumber',
          submissionId: '$_id'
        }
      },
      { $merge: { into: REFERENCE_NUMBERS_COLLECTION_NAME } }
    ])
    .toArray()

  console.log(
    `[REF-MIG] Added records into ${REFERENCE_NUMBERS_COLLECTION_NAME} collection from the existing ${SUBMISSIONS_COLLECTION_NAME} collection via aggregation pipeline`
  )

  console.log(
    `[REF-MIG] Adding indexes to the new ${REFERENCE_NUMBERS_COLLECTION_NAME} collection`
  )

  // Add unique index on the `referenceNumber` field to the `reference-numbers` collection and expireAt TTL index
  await referenceNumbersColl.createIndex(
    { referenceNumber: 1 },
    { unique: true }
  )

  await referenceNumbersColl.createIndex(
    { expireAt: 1 },
    { expireAfterSeconds: 0 }
  ) // enables TTL

  console.log(
    `[REF-MIG] Added indexes to the new ${REFERENCE_NUMBERS_COLLECTION_NAME} collection`
  )

  console.log(
    `[REF-MIG] Dropping the non-unique index on the meta.referenceNumber field in the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  // Drop the (non-unique) index on the `meta.referenceNumber` field in the `submissions` collection
  await submissionsColl.dropIndex('meta.referenceNumber_1')

  console.log(
    `[REF-MIG] Recreating the meta.referenceNumber index as unique in the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  // Re-add unique index on the `meta.referenceNumber` field to the `submissions` collection
  await submissionsColl.createIndex(
    { 'meta.referenceNumber': 1 },
    { unique: true }
  )

  console.log(
    `[REF-MIG] Recreated the meta.referenceNumber index as unique in the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  console.log(
    `[REF-MIG] Finished migration of reference numbers to the new collection`
  )
}

/**
 * Drop the new `reference-numbers` collection and undo the index changes made in the `up` migration
 * @param {Db} db - the Mongo Db instance
 */
export const down = async (db) => {
  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  const referenceNumbersColl =
    /** @type {Collection<FormSubmissionReferenceNumberDocument>} */ (
      db.collection(REFERENCE_NUMBERS_COLLECTION_NAME)
    )

  // Drop the unique index on the `meta.referenceNumber` field in the `submissions` collection
  await submissionsColl.dropIndex('meta.referenceNumber_1')

  // Recreate the (non-unique) index on the `meta.referenceNumber` field in the `submissions` collection
  await submissionsColl.createIndex({ 'meta.referenceNumber': 1 })

  // Drop the `reference-numbers` collection
  await referenceNumbersColl.drop()
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormSubmissionDocument, FormSubmissionReferenceNumberDocument } from '~/src/api/types.js'
 */
