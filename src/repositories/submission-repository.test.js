import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  STUB_FORM_ID,
  STUB_SUBMISSION_REF,
  buildDbDocument
} from '~/src/repositories/__stubs__/submission.js'
import {
  createSubmissionRecord,
  getSubmissionRecordByReference,
  getSubmissionRecords,
  getSubmissionRecordsForDate
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
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  describe('getSubmissionRecords', () => {
    it('should get submission records cursor', () => {
      mockCollection.find.mockReturnValueOnce({
        sort: jest.fn(() => {
          return { next: () => submissionDocument }
        })
      })
      const submissionRecord = getSubmissionRecords(STUB_FORM_ID)
      expect(submissionRecord.next()).toEqual(submissionDocument)
    })

    it('should handle get submission record failures', () => {
      mockCollection.find.mockImplementation(() => {
        throw new Error('an error')
      })

      expect(() => getSubmissionRecords(STUB_FORM_ID)).toThrow(
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

  describe('getSubmissionRecordByReference', () => {
    it('should get submission record', async () => {
      jest.mocked(
        mockCollection.findOne.mockResolvedValueOnce(submissionDocument)
      )
      const submissionRecord =
        await getSubmissionRecordByReference(STUB_SUBMISSION_REF)
      expect(submissionRecord).toEqual(submissionDocument)
    })

    it('should handle get submission record failures', async () => {
      mockCollection.findOne.mockImplementation(() => {
        throw new Error('an error')
      })

      await expect(
        getSubmissionRecordByReference(STUB_SUBMISSION_REF)
      ).rejects.toThrow(new Error('an error'))
    })
  })

  describe('getSubmissionRecordsForDate', () => {
    it('should get submission records cursor', () => {
      mockCollection.find.mockReturnValueOnce({
        sort: jest.fn(() => {
          return { next: () => submissionDocument }
        })
      })
      const date = new Date('2026-02-15')
      const submissionRecord = getSubmissionRecordsForDate(date)
      expect(submissionRecord.next()).toEqual(submissionDocument)
      expect(mockCollection.find).toHaveBeenCalledWith({
        'meta.timestamp': {
          $gte: new Date('2026-02-15T00:00:00.000Z'),
          $lte: new Date('2026-02-15T23:59:59.999Z')
        }
      })
    })

    it('should log and throw when error', () => {
      mockCollection.find.mockImplementationOnce(() => {
        throw new Error('db error')
      })
      const date = new Date()
      expect(() => getSubmissionRecordsForDate(date)).toThrow('db error')
    })
  })
})
