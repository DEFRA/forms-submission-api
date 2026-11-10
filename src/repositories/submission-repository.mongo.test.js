import { MongoMemoryServer } from 'mongodb-memory-server'

import {
  USER_EMAIL_INDEX_COLLATION,
  USER_EMAIL_INDEX_NAME,
  up as createUserEmailIndex
} from '~/migrations/20261103090000-submissions-user-email-index.js'
import { config } from '~/src/config/index.js'
import {
  SUBMISSIONS_COLLECTION_NAME,
  client,
  db,
  prepareDb
} from '~/src/mongo.js'
import {
  USER_EMAIL_COLLATION,
  linkSubmissionRecordsToUser
} from '~/src/repositories/submission-repository.js'

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
const OTHER_FORM_ID = '688131eeff67f889d52c66dd'
const EMAIL = 'user@example.com'

/**
 * A submission of the form under test. Only the fields the query reads are set.
 * @param {string} referenceNumber
 * @param {{ formId?: string, custom?: Record<string, unknown>, auth?: { sub: string, issuer: string } }} [overrides]
 */
function buildSubmission(referenceNumber, overrides = {}) {
  return {
    meta: {
      referenceNumber,
      formId: overrides.formId ?? FORM_ID,
      custom: overrides.custom ?? { userConfirmationEmail: EMAIL },
      ...(overrides.auth && { auth: overrides.auth })
    }
  }
}

/**
 * @param {Record<string, unknown>[]} submissions
 */
async function insert(submissions) {
  await db.collection(SUBMISSIONS_COLLECTION_NAME).insertMany(submissions)
}

/**
 * The `meta.auth` of each submission, by reference number
 */
async function readAuth() {
  const submissions = await db
    .collection(SUBMISSIONS_COLLECTION_NAME)
    .find({}, { projection: { _id: 0, meta: 1 } })
    .toArray()

  return Object.fromEntries(
    submissions.map((submission) => [
      submission.meta.referenceNumber,
      submission.meta.auth
    ])
  )
}

/** @type {MongoMemoryServer} */
let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({
    binary: { version: MONGO_VERSION }
  })
  config.set('mongo.uri', mongod.getUri())

  await prepareDb(mockLogger)
  await createUserEmailIndex(db)
}, MONGO_BOOT_TIMEOUT_MS)

afterAll(async () => {
  await client.close()
  await mongod.stop()
})

beforeEach(async () => {
  await db.collection(SUBMISSIONS_COLLECTION_NAME).deleteMany({})
})

describe('linkSubmissionRecordsToUser', () => {
  it('should use the same collation as the index', () => {
    expect(USER_EMAIL_COLLATION).toEqual(USER_EMAIL_INDEX_COLLATION)
  })

  it('should link the unlinked submissions of the form with the email', async () => {
    await insert([
      buildSubmission('first'),
      buildSubmission('second', { custom: { userConfirmationEmail: EMAIL } })
    ])

    const linked = await linkSubmissionRecordsToUser(
      SUB,
      ISSUER,
      FORM_ID,
      EMAIL
    )

    expect(linked).toBe(2)
    expect(await readAuth()).toEqual({
      first: { sub: SUB, issuer: ISSUER },
      second: { sub: SUB, issuer: ISSUER }
    })
  })

  it('should match the email case-insensitively', async () => {
    await insert([
      buildSubmission('mixed-case', {
        custom: { userConfirmationEmail: 'User@Example.COM' }
      })
    ])

    const linked = await linkSubmissionRecordsToUser(
      SUB,
      ISSUER,
      FORM_ID,
      EMAIL
    )

    expect(linked).toBe(1)
    expect(await readAuth()).toEqual({
      'mixed-case': { sub: SUB, issuer: ISSUER }
    })
  })

  it('should link a submission whose auth has no subject', async () => {
    await insert([
      {
        meta: {
          referenceNumber: 'null-sub',
          formId: FORM_ID,
          custom: { userConfirmationEmail: EMAIL },
          auth: { sub: null, issuer: null }
        }
      }
    ])

    const linked = await linkSubmissionRecordsToUser(
      SUB,
      ISSUER,
      FORM_ID,
      EMAIL
    )

    expect(linked).toBe(1)
    expect(await readAuth()).toEqual({
      'null-sub': { sub: SUB, issuer: ISSUER }
    })
  })

  it('should not change a submission already linked to an account', async () => {
    const otherAuth = { sub: 'another-sub', issuer: 'https://another.test' }
    const ownAuth = { sub: SUB, issuer: ISSUER }
    await insert([
      buildSubmission('other-account', { auth: otherAuth }),
      buildSubmission('own-account', { auth: ownAuth })
    ])

    const linked = await linkSubmissionRecordsToUser(
      SUB,
      ISSUER,
      FORM_ID,
      EMAIL
    )

    expect(linked).toBe(0)
    expect(await readAuth()).toEqual({
      'other-account': otherAuth,
      'own-account': ownAuth
    })
  })

  it('should not link submissions of another form or with another email', async () => {
    await insert([
      buildSubmission('other-form', { formId: OTHER_FORM_ID }),
      buildSubmission('other-email', {
        custom: { userConfirmationEmail: 'someone@example.com' }
      }),
      buildSubmission('no-email', { custom: {} })
    ])

    const linked = await linkSubmissionRecordsToUser(
      SUB,
      ISSUER,
      FORM_ID,
      EMAIL
    )

    expect(linked).toBe(0)
    expect(await readAuth()).toEqual({
      'other-form': undefined,
      'other-email': undefined,
      'no-email': undefined
    })
  })

  it('should find the submissions with the user email index', async () => {
    await insert([buildSubmission('first')])

    const explain = await db
      .collection(SUBMISSIONS_COLLECTION_NAME)
      .find(
        {
          'meta.formId': FORM_ID,
          'meta.custom.userConfirmationEmail': EMAIL,
          'meta.auth.sub': null
        },
        { collation: USER_EMAIL_COLLATION }
      )
      .explain()

    expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain(
      `"indexName":"${USER_EMAIL_INDEX_NAME}"`
    )
  })
})
