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
    'Reading submission records and inserting existing reference numbers'
  )

  const submissionsColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(SUBMISSIONS_COLLECTION_NAME)
  )
  const referenceNumbersColl =
    /** @type {Collection<FormSubmissionReferenceNumberDocument>} */ (
      db.collection(REFERENCE_NUMBERS_COLLECTION_NAME)
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
  }

  console.log(`Inserted ${counter} reference numbers`)
}

/**
 * Drop the new `reference-numbers` collection
 * @param {Db} db - the Mongo Db instance
 */
export const down = async (db) => {
  await db.collection(REFERENCE_NUMBERS_COLLECTION_NAME).drop()
}

/**
 * @import { Db, Collection } from 'mongodb'
 * @import { FormSubmissionDocument, FormSubmissionReferenceNumberDocument } from '~/src/api/types.js'
 */
