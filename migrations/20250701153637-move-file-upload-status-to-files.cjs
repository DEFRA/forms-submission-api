/* eslint-disable */
module.exports = {
  /**
   * Safely copies documents from 'file-upload-status' to 'files' collection
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async up(db, client) {
    const filesCollection = db.collection('files')
    const fileUploadStatusCollection = db.collection('file-upload-status')

    const documentsToMigrate = await fileUploadStatusCollection
      .find({})
      .toArray()

    if (documentsToMigrate.length === 0) {
      console.log('No documents found in file-upload-status collection')
      return
    }

    console.log(
      `Found ${documentsToMigrate.length} documents in file-upload-status collection`
    )

    let inserted = 0
    let skipped = 0
    let errors = 0

    const session = client.startSession()

    try {
      await session.withTransaction(async () => {
        const existingFileIds = new Set(
          (
            await filesCollection
              .find({}, { projection: { fileId: 1 } })
              .toArray()
          ).map((doc) => doc.fileId)
        )

        const docsToInsert = documentsToMigrate
          .filter((doc) => {
            if (existingFileIds.has(doc.fileId)) {
              console.log(
                `Skipping fileId ${doc.fileId} - already exists in files collection`
              )
              skipped++
              return false
            }
            return true
          })
          .map(({ _id, ...docWithoutId }) => docWithoutId)

        if (docsToInsert.length > 0) {
          const result = await filesCollection.insertMany(docsToInsert, {
            session
          })
          inserted = result.insertedCount

          docsToInsert.forEach((doc) => {
            console.log(`Migrated fileId ${doc.fileId} to files collection`)
          })
        }
      })
    } catch (error) {
      console.error(
        'Migration failed:',
        error instanceof Error ? error.message : String(error)
      )
      errors = documentsToMigrate.length - skipped - inserted
    } finally {
      await session.endSession()
    }

    console.log('\n=== Migration Summary ===')
    console.log(`Total documents processed: ${documentsToMigrate.length}`)
    console.log(`Successfully migrated: ${inserted}`)
    console.log(`Skipped (already existed): ${skipped}`)
    console.log(`Errors: ${errors}`)
    console.log('Note: file-upload-status collection has been preserved')
  },

  /**
   * This migration is a one-way data consolidation fix.
   * @param db {import('mongodb').Db}
   * @param client {import('mongodb').MongoClient}
   * @returns {Promise<void>}
   */
  async down(db, client) {
    throw new Error(
      'Migration rollback is not supported for data safety reasons'
    )
  }
}
