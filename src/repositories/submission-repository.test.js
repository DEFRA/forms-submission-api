import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  STUB_FORM_ID,
  buildDbDocument
} from '~/src/repositories/__stubs__/submission.js'
import {
  createSubmissionRecord,
  getSubmissionRecords
} from '~/src/repositories/submission-repository.js'

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

describe('submission repository', () => {
  const submissionDocument = buildDbDocument()

  const submissionRecordInput = structuredClone(buildDbDocument())

  beforeEach(() => {
    // @ts-expect-error - test stub
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  describe('getSubmissionRecords', () => {
    it('should get submission records', async () => {
      mockCollection.findOne.mockReturnValueOnce(submissionDocument)
      const submissionRecord = await getSubmissionRecords(STUB_FORM_ID)
      expect(submissionRecord).toEqual(submissionDocument)
    })

    it('should handle get submission record failures', async () => {
      mockCollection.findOne.mockImplementation(() => {
        throw new Error('an error')
      })
      await expect(getSubmissionRecords(STUB_FORM_ID)).rejects.toThrow(
        new Error('an error')
      )
    })
  })

  describe('createSubmissionRecord', () => {
    it('should create a submission record', async () => {
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )
      await createSubmissionRecord(submissionRecordInput, mockSession)
      const [insertedSubmissionRecordInput, session] =
        mockCollection.insertOne.mock.calls[0]
      expect(insertedSubmissionRecordInput).toEqual(submissionRecordInput)
      expect(session).toEqual({ session: mockSession })
    })

    it('should handle failures', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(
        createSubmissionRecord(submissionRecordInput, mockSession)
      ).rejects.toThrow(new Error('Failed'))
    })
  })
})
