import { MongoMemoryServer } from 'mongodb-memory-server'

import { config } from '~/src/config/index.js'
import {
  FILES_COLLECTION_NAME,
  REFERENCE_NUMBERS_COLLECTION_NAME,
  SAVE_AND_EXIT_COLLECTION_NAME,
  SUBMISSIONS_COLLECTION_NAME,
  client,
  db,
  prepareDb
} from '~/src/mongo.js'

const MONGO_VERSION = '6.0.14'

// Jest might timeout, so increase it to account for the mongo download
const MONGO_BOOT_TIMEOUT_MS = 180_000

const mockLogger = /** @type {never} */ ({
  info: jest.fn()
})

describe.skip('prepareDb', () => {
  /** @type {MongoMemoryServer} */
  let mongod

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      binary: { version: MONGO_VERSION }
    })
    config.set('mongo.uri', mongod.getUri())

    await prepareDb(mockLogger)
  }, MONGO_BOOT_TIMEOUT_MS)

  afterAll(async () => {
    await client.close()
    await mongod.stop()
  })

  it('creates a unique index on files.fileId', async () => {
    const indexes = await db.collection(FILES_COLLECTION_NAME).indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { fileId: 1 }, unique: true })
    )
  })

  it('creates the save-and-exit indexes', async () => {
    const indexes = await db.collection(SAVE_AND_EXIT_COLLECTION_NAME).indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { magicLinkId: 1 }, unique: true })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { magicLinkGroupId: 1 } })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { expireAt: 1 },
        expireAfterSeconds: 0
      })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: {
          'notify.expireEmailSentTimestamp': 1,
          expireAt: 1,
          consumed: 1
        }
      })
    )
  })

  it('creates the submissions indexes', async () => {
    const indexes = await db.collection(SUBMISSIONS_COLLECTION_NAME).indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { 'meta.formId': 1 } })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { 'meta.referenceNumber': 1 },
        unique: true
      })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { 'meta.timestamp': -1 } })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { expireAt: 1 },
        expireAfterSeconds: 0
      })
    )
  })

  it('creates the reference-numbers indexes', async () => {
    const indexes = await db
      .collection(REFERENCE_NUMBERS_COLLECTION_NAME)
      .indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { referenceNumber: 1 }, unique: true })
    )
    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { expireAt: 1 },
        expireAfterSeconds: 0
      })
    )
  })
})
