import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  STUB_SUBMISSION_RECORD_ID,
  buildSaveAndExitMessage,
  buildSubmissionMetaBase,
  buildSubmissionRecordDocument,
  buildSubmissionRecordDocumentMeta
} from '~/src/repositories/__stubs__/save-and-exit.js'
import {
  createSaveAndExitRecord,
  getSaveAndExitRecord
} from '~/src/repositories/save-and-exit-repository.js'

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

describe('save-and-exit-repository', () => {
  const recordInput = buildSubmissionMetaBase({
    recordCreatedAt: new Date('2025-08-08'),
    messageId: '23b3e93c-5bea-4bcc-ab27-be69ce82a190'
  })
  const message = buildSaveAndExitMessage()
  const submissionRecordInput = buildSubmissionRecordDocument(
    message,
    recordInput
  )
  const submissionDocument = buildSubmissionRecordDocument(
    message,
    buildSubmissionRecordDocumentMeta({
      ...submissionRecordInput
    })
  )

  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  describe('getSaveAndExitRecord', () => {
    it('should get save-and-exit record', async () => {
      mockCollection.findOne.mockReturnValueOnce(submissionDocument)
      const submissionRecord = await getSaveAndExitRecord(
        STUB_SUBMISSION_RECORD_ID
      )
      expect(submissionRecord).toEqual(submissionDocument)
    })

    it('should handle get save-and-exit record failures', async () => {
      mockCollection.findOne.mockImplementation(() => {
        throw new Error('an error')
      })
      await expect(
        getSaveAndExitRecord(STUB_SUBMISSION_RECORD_ID)
      ).rejects.toThrow(new Error('an error'))
    })
  })

  describe('createSaveAndExitRecord', () => {
    it('should create a save-and-exit record', async () => {
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )
      await createSaveAndExitRecord(submissionRecordInput, mockSession)
      const [insertedSubmissionRecordInput, session] =
        mockCollection.insertOne.mock.calls[0]
      expect(insertedSubmissionRecordInput).toEqual({
        ...submissionRecordInput,
        expireAt: expect.any(Date)
      })
      expect(session).toEqual({ session: mockSession })
    })

    it('should handle failures', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(
        createSaveAndExitRecord(submissionRecordInput, mockSession)
      ).rejects.toThrow(new Error('Failed'))
    })
  })
})
