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
    '[REF-MIG] Checking for duplicate reference numbers in submissions collection'
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

    // Print out duplicate meta.referenceNumber values and abort the migration
    for (const duplicate of duplicates) {
      const dupDocs = await submissionsColl
        .find(
          { 'meta.referenceNumber': duplicate._id },
          { projection: { meta: 1 } }
        )
        .toArray()

      for (const doc of dupDocs) {
        console.error(
          `[REF-MIG] Found duplicate reference number in submissions collection: ${duplicate._id} (count: ${duplicate.count}) - meta: ${JSON.stringify(doc.meta)}`
        )
      }
    }

    throw new Error(
      `[REF-MIG] Found duplicate reference numbers in submissions collection, aborting migration before any changes are made. Sample (up to 100): ${sample}`
    )
  }

  console.log(
    '[REF-MIG] No duplicate reference numbers found in submissions collection'
  )

  console.log(
    '[REF-MIG] Adding records into reference-numbers collection from the existing submissions collection via aggregation pipeline'
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
    '[REF-MIG] Added records into reference-numbers collection from the existing submissions collection via aggregation pipeline'
  )

  console.log(
    '[REF-MIG] Adding unique index to the new reference-numbers collection'
  )

  // Add unique index on the `referenceNumber` field to the `reference-numbers` collection
  await referenceNumbersColl.createIndex(
    { referenceNumber: 1 },
    { unique: true }
  )

  console.log(
    '[REF-MIG] Added unique index to the new reference-numbers collection'
  )

  console.log(
    `[REF-MIG] Dropping the non-unique index on the meta.referenceNumber field in the submissions collection`
  )

  // Drop the (non-unique) index on the `meta.referenceNumber` field in the `submissions` collection
  await submissionsColl.dropIndex('meta.referenceNumber_1')

  console.log(
    `[REF-MIG] Creating unique index on the meta.referenceNumber field in the submissions collection`
  )

  // Re-add unique index on the `meta.referenceNumber` field to the `submissions` collection
  await submissionsColl.createIndex(
    { 'meta.referenceNumber': 1 },
    { unique: true }
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

  // Recreate the (non-unique) index on the `meta.referenceNumber` field in the `submissions` collection
  await submissionsColl.createIndex({ 'meta.referenceNumber': 1 })

  await referenceNumbersColl.drop()
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormSubmissionDocument, FormSubmissionReferenceNumberDocument } from '~/src/api/types.js'
 */
