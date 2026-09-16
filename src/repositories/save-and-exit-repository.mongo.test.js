import { FormStatus } from '@defra/forms-model'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { config } from '~/src/config/index.js'
import {
  SAVE_AND_EXIT_COLLECTION_NAME,
  client,
  db,
  prepareDb
} from '~/src/mongo.js'
import { buildSaveAndExitV2Message } from '~/src/repositories/__stubs__/save-and-exit.js'
import {
  createSaveAndExitRecord,
  findSaveAndExitRecordForUser,
  findSaveAndExitRecordsForUser
} from '~/src/repositories/save-and-exit-repository.js'
import { mapSaveAndExitDataToDocumentV2 } from '~/src/services/save-and-exit-events.js'

jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn()
  }
}))

const MONGO_VERSION = '6.0.14'

// Jest might timeout, so increase it to account for the mongo download
const MONGO_BOOT_TIMEOUT_MS = 180_000

const mockLogger = /** @type {never} */ ({
  info: jest.fn()
})

const SUB = 'a3f1c0de-0000-4000-8000-000000000001'
const ISSUER = 'https://identity.test'
const FORM_ID = '688131eeff67f889d52c66cc'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A date some days from the time the test runs. The query compares expiry
 * with the database clock, so expiry dates in the sort tests count from now
 * rather than from a fixed date, so that they stay on the same side of it.
 * @param {number} days - negative for a date in the past
 */
function daysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS)
}

/**
 * A saved record of the citizen, for the form under test
 * @param {string} magicLinkId
 * @param {Record<string, unknown>} [overrides]
 */
function buildRecord(magicLinkId, overrides = {}) {
  return {
    magicLinkId,
    magicLinkGroupId: `group-${magicLinkId}`,
    form: {
      id: FORM_ID,
      title: 'My FirstForm',
      status: 'draft',
      isPreview: false,
      baseUrl: 'http://localhost:3009'
    },
    auth: { sub: SUB, issuer: ISSUER },
    state: { formField1: 'val1' },
    invalidPasswordAttempts: 0,
    consumed: false,
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    expireAt: new Date('2026-09-29T09:00:00.000Z'),
    ...overrides
  }
}

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

beforeEach(async () => {
  await db.collection(SAVE_AND_EXIT_COLLECTION_NAME).deleteMany({})
})

describe('findSaveAndExitRecordsForUser', () => {
  /**
   * @param {Record<string, unknown>[]} records
   */
  async function insert(records) {
    await db.collection(SAVE_AND_EXIT_COLLECTION_NAME).insertMany(records)
  }

  it('should return the latest record of a group', async () => {
    await insert([
      buildRecord('older', {
        magicLinkGroupId: 'group-1',
        createdAt: new Date('2026-09-01T09:00:00.000Z')
      }),
      buildRecord('newer', {
        magicLinkGroupId: 'group-1',
        createdAt: new Date('2026-09-02T09:00:00.000Z')
      })
    ])

    const records = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(records.map((record) => record.magicLinkId)).toEqual(['newer'])
  })

  it('should return the records that expire first at the top', async () => {
    await insert([
      buildRecord('later', { expireAt: daysFromNow(15) }),
      buildRecord('sooner', { expireAt: daysFromNow(1) })
    ])

    const records = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(records.map((record) => record.magicLinkId)).toEqual([
      'sooner',
      'later'
    ])
  })

  it('should return the expired records after the records that have not expired', async () => {
    await insert([
      buildRecord('later', { expireAt: daysFromNow(15) }),
      buildRecord('expired', { expireAt: daysFromNow(-1) }),
      buildRecord('sooner', { expireAt: daysFromNow(1) })
    ])

    const records = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(records.map((record) => record.magicLinkId)).toEqual([
      'sooner',
      'later',
      'expired'
    ])
  })

  it('should not return a consumed record', async () => {
    await insert([buildRecord('consumed', { consumed: true })])

    const records = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(records).toEqual([])
  })

  it('should not return the records of another citizen or another form', async () => {
    await insert([
      buildRecord('other-sub', { auth: { sub: 'other-sub', issuer: ISSUER } }),
      buildRecord('other-issuer', {
        auth: { sub: SUB, issuer: 'https://impostor.example' }
      }),
      buildRecord('other-form', {
        form: { ...buildRecord('other-form').form, id: 'other-form-id' }
      })
    ])

    const records = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(records).toEqual([])
  })

  it('should return only the fields the citizen dashboard shows', async () => {
    await insert([
      buildRecord('with-reference', {
        state: { formField1: 'val1', $$__referenceNumber: '123-456-789' }
      })
    ])

    const [record] = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(record).toEqual({
      _id: expect.anything(),
      magicLinkId: 'with-reference',
      form: { title: 'My FirstForm' },
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      expireAt: new Date('2026-09-29T09:00:00.000Z'),
      referenceNumber: '123-456-789'
    })
  })

  it('should leave out the reference number when the saved answers have none', async () => {
    await insert([buildRecord('without-reference')])

    const [record] = await findSaveAndExitRecordsForUser(SUB, ISSUER, FORM_ID)

    expect(record.magicLinkId).toBe('without-reference')
    expect(record).not.toHaveProperty('referenceNumber')
  })
})

describe('findSaveAndExitRecordForUser', () => {
  const SUBJECT = 'auth-sub'
  const ISSUER_URL = 'https://identity.test'
  const LINK = 'fd4e6453-fb32-43e4-b4cf-12b381a713de'

  /** @type {ClientSession} */
  let session

  beforeEach(() => {
    session = client.startSession()
  })

  afterEach(async () => {
    await session.endSession()
  })

  /**
   * Builds a record the way the queue does, so the test crosses the rename
   * from the token's `iss` to the record's `auth.issuer`.
   * @param {string} messageId
   */
  function buildRecordFromMessage(messageId) {
    return mapSaveAndExitDataToDocumentV2({
      messageId,
      parsedContent: buildSaveAndExitV2Message({
        data: {
          form: {
            id: '689b3b1a7f8e2d0012a4b7c1',
            title: 'My First Form',
            status: FormStatus.Live,
            isPreview: false,
            baseUrl: 'http://localhost:3009'
          },
          email: 'citizen@example.com',
          auth: { sub: SUBJECT, issuer: ISSUER_URL },
          state: { formField1: 'val1' }
        }
      })
    })
  }

  it('returns the saved answers to the citizen who saved them', async () => {
    await createSaveAndExitRecord(buildRecordFromMessage(LINK), session)

    const record = await findSaveAndExitRecordForUser(SUBJECT, ISSUER_URL, LINK)

    expect(record?.state).toEqual({ formField1: 'val1' })
    expect(record?.magicLinkGroupId).toEqual(expect.any(String))
  })

  it('leaves `_id` out, so the caller cannot mistake it for a link', async () => {
    await createSaveAndExitRecord(buildRecordFromMessage(LINK), session)

    const record = await findSaveAndExitRecordForUser(SUBJECT, ISSUER_URL, LINK)

    expect(record).not.toHaveProperty('_id')
  })

  it('returns nothing for a citizen who does not own the record', async () => {
    await createSaveAndExitRecord(buildRecordFromMessage(LINK), session)

    await expect(
      findSaveAndExitRecordForUser('another-sub', ISSUER_URL, LINK)
    ).resolves.toBeNull()
  })

  it('returns nothing when the subject matches but the issuer does not', async () => {
    await createSaveAndExitRecord(buildRecordFromMessage(LINK), session)

    await expect(
      findSaveAndExitRecordForUser(SUBJECT, 'https://elsewhere.test', LINK)
    ).resolves.toBeNull()
  })

  it('returns nothing for a record that has expired', async () => {
    const record = buildRecordFromMessage(LINK)
    await createSaveAndExitRecord(record, session)
    await db
      .collection(SAVE_AND_EXIT_COLLECTION_NAME)
      .updateOne(
        { magicLinkId: LINK },
        { $set: { expireAt: new Date('2020-01-01T00:00:00.000Z') } }
      )

    await expect(
      findSaveAndExitRecordForUser(SUBJECT, ISSUER_URL, LINK)
    ).resolves.toBeNull()
  })

  it('returns nothing for a record that has been consumed', async () => {
    await createSaveAndExitRecord(buildRecordFromMessage(LINK), session)
    await db
      .collection(SAVE_AND_EXIT_COLLECTION_NAME)
      .updateOne({ magicLinkId: LINK }, { $set: { consumed: true } })

    await expect(
      findSaveAndExitRecordForUser(SUBJECT, ISSUER_URL, LINK)
    ).resolves.toBeNull()
  })
})

/**
 * @import { ClientSession } from 'mongodb'
 */
