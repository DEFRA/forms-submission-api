import { ObjectId } from 'mongodb'

import { MONGO_DUPLICATE_KEY_ERROR } from '~/src/constants.js'
import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  create,
  updateWithSubmissionId
} from '~/src/repositories/reference-number-repository.js'

const mockCollection = buildMockCollection()

/**
 * @type {any}
 */
const mockSession = {}

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false
  const collection =
    /** @satisfies {Collection<{draft: FormDefinition}>} */ jest
      .fn()
      .mockImplementation(() => mockCollection)
  return {
    db: {
      collection
    },
    get client() {
      if (!isPrepared) {
        return undefined
      }

      return {
        startSession: () => ({
          endSession: jest.fn().mockResolvedValue(undefined),
          withTransaction: jest.fn(
            /**
             * Mock transaction handler
             * @param {() => Promise<void>} fn
             */
            async (fn) => fn()
          )
        })
      }
    },

    prepareDb() {
      isPrepared = true
      return Promise.resolve()
    }
  }
})

describe('reference-number-repository', () => {
  beforeEach(() => {
    jest
      .mocked(db.collection)
      .mockReturnValue(/** @type {any} */ (mockCollection))
  })

  describe('create', () => {
    it('should create a reference number record', async () => {
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )
      const { referenceNumber } = await create('ABC')
      const [insertedRecordInput] = mockCollection.insertOne.mock.calls[0]

      expect(insertedRecordInput).toEqual({
        referenceNumber: expect.any(String),
        expireAt: expect.any(Date)
      })
      expect(referenceNumber).toHaveLength(11)
      expect(referenceNumber.substring(0, 3)).toBe('ABC')
    })

    it('should create a reference number record after collision', async () => {
      const err = new Error()
      // @ts-expect-error - mock mongo error
      err.code = MONGO_DUPLICATE_KEY_ERROR

      jest.mocked(mockCollection.insertOne.mockRejectedValueOnce(err))
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )

      const { referenceNumber } = await create('ABC')

      const [insertedRecordInput] = mockCollection.insertOne.mock.calls[1]

      expect(insertedRecordInput).toEqual({
        referenceNumber: expect.any(String),
        expireAt: expect.any(Date)
      })
      expect(referenceNumber).toHaveLength(11)
      expect(referenceNumber.substring(0, 3)).toBe('ABC')
    })
  })

  describe('updateWithSubmissionId', () => {
    it('should update reference number record', async () => {
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 })
      const referenceNumber = 'XXX-XXX-XXX'
      const submissionId = new ObjectId()
      const result = await updateWithSubmissionId(
        referenceNumber,
        submissionId,
        mockSession
      )
      const [filter, update, session] = mockCollection.updateOne.mock.calls[0]
      expect(result).toBe(true)
      expect(filter).toEqual({ referenceNumber })
      expect(session).toEqual({ session: mockSession })
      expect(update).toEqual({
        $set: { submissionId },
        $unset: { expireAt: '' }
      })
    })
  })
})
