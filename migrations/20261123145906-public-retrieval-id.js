/* eslint-disable no-console */
import { randomUUID } from 'node:crypto'

export const FILES_COLLECTION_NAME = 'files'
export const SUBMISSIONS_COLLECTION_NAME = 'submissions'

/**
 * Adds a public retrieval id to the collection
 * @param {Collection<any>} coll
 */
async function addRetrievalKey(coll) {
  const cursor = coll.find({}, { projection: { _id: 1 } })
  const operations = []

  for await (const doc of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            publicRetrievalId: randomUUID()
          }
        }
      }
    })

    if (operations.length === 1000) {
      await coll.bulkWrite(operations)
      operations.length = 0
    }
  }

  if (operations.length) {
    await coll.bulkWrite(operations)
  }

  await coll.createIndex({ publicRetrievalId: 1 }, { unique: true })
}

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

  await addRetrievalKey(submissionsColl)

  console.log(
    `[PUBLIC-RETRIEVAL-ID] Added public retrieval ID to the ${SUBMISSIONS_COLLECTION_NAME} collection`
  )

  console.log(
    `[PUBLIC-RETRIEVAL-ID] Adding public retrieval ID to the ${FILES_COLLECTION_NAME} collection`
  )

  const filesColl = /** @type {Collection<FormSubmissionDocument>} */ (
    db.collection(FILES_COLLECTION_NAME)
  )

  await addRetrievalKey(filesColl)

  console.log(
    `[PUBLIC-RETRIEVAL-ID] Added public retrieval ID to the ${FILES_COLLECTION_NAME} collection`
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
