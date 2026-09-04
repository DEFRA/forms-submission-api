/* eslint-disable no-console */

export const SUBMISSIONS_COLLECTION_NAME = 'submissions'
export const REFERENCE_NUMBERS_COLLECTION_NAME = 'reference-numbers'

/**
 * Create the new `reference-numbers` collection and seed it
 * with all the reference numbers from the submissions collection
 * @param {Db} db - the Mongo Db instance
 */
export const up = async (db) => {
  console.log(
    '[REF-MIG] Reading submission records and inserting existing reference numbers'
  )

  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )

  const referenceNumbersColl =
    /** @type {Collection<FormSubmissionReferenceNumberDocument>} */ (
      db.collection(REFERENCE_NUMBERS_COLLECTION_NAME)
    )

  console.log(
    '[REF-MIG] Adding records into reference-numbers collection from the existing submissions collection'
  )

  let counter = 0
  for await (const record of submissionsColl.find(
    {},
    { projection: { 'meta.referenceNumber': 1 } }
  )) {
    await referenceNumbersColl.insertOne({
      referenceNumber: record.meta.referenceNumber,
      submissionId: record._id
    })
    ++counter

    if (counter % 5000 === 0) {
      console.log(`[REF-MIG] Counter ${counter} records processed`)
    }
  }

  console.log(
    `[REF-MIG] Added ${counter} records into reference-numbers collection from the existing submissions collection`
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
  await submissionsColl.createIndex({ referenceNumber: 1 })

  await referenceNumbersColl.drop()
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormSubmissionDocument, FormSubmissionReferenceNumberDocument } from '~/src/api/types.js'
 */
