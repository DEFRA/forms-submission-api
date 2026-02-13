import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  STUB_SAVE_AND_EXIT_RECORD_ID,
  buildDbDocument
} from '~/src/repositories/__stubs__/save-and-exit.js'
import {
  createSaveAndExitRecord,
  deleteSaveAndExitRecord,
  findExpiringRecords,
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts,
  lockRecordForExpiryEmail,
  markExpiryEmailSent
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
  const submissionDocument = buildDbDocument()

  const submissionRecordInput = structuredClone(buildDbDocument())

  beforeEach(() => {
    // @ts-expect-error - test stub
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  describe('getSaveAndExitRecord', () => {
    it('should get save and exit record', async () => {
      mockCollection.findOne.mockReturnValueOnce(submissionDocument)
      const submissionRecord = await getSaveAndExitRecord(
        STUB_SAVE_AND_EXIT_RECORD_ID
      )
      expect(submissionRecord).toEqual(submissionDocument)
    })

    it('should handle get save and exit record failures', async () => {
      mockCollection.findOne.mockImplementation(() => {
        throw new Error('an error')
      })
      await expect(
        getSaveAndExitRecord(STUB_SAVE_AND_EXIT_RECORD_ID)
      ).rejects.toThrow(new Error('an error'))
    })
  })

  describe('createSaveAndExitRecord', () => {
    it('should create a save and exit record', async () => {
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )
      await createSaveAndExitRecord(submissionRecordInput, mockSession)
      const [insertedSubmissionRecordInput, session] =
        mockCollection.insertOne.mock.calls[0]
      expect(insertedSubmissionRecordInput).toEqual({
        ...submissionRecordInput,
        expireAt: expect.any(Date),
        invalidPasswordAttempts: 0
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

  describe('incrementInvalidPasswordAttempts', () => {
    it('should increment record', async () => {
      jest.mocked(
        mockCollection.findOneAndUpdate.mockResolvedValueOnce({
          ...submissionRecordInput,
          expireAt: expect.any(Date),
          invalidPasswordAttempts: 1
        })
      )
      const res = await incrementInvalidPasswordAttempts('123')
      const [updated] = mockCollection.findOneAndUpdate.mock.calls[0]
      expect(updated).toEqual({
        magicLinkId: '123'
      })
      expect(res).toEqual({
        ...submissionRecordInput,
        expireAt: expect.any(Date),
        invalidPasswordAttempts: 1
      })
      expect(mockCollection.deleteOne).not.toHaveBeenCalled()
    })

    it('should delete record if increment max threshold reached', async () => {
      jest.mocked(
        mockCollection.findOneAndUpdate.mockResolvedValueOnce({
          ...submissionRecordInput,
          expireAt: expect.any(Date),
          invalidPasswordAttempts: 5
        })
      )
      const res = await incrementInvalidPasswordAttempts('123')
      const [updated] = mockCollection.findOneAndUpdate.mock.calls[0]
      expect(updated).toEqual({
        magicLinkId: '123'
      })
      expect(res.form).toBeDefined()
      expect(mockCollection.deleteOne).toHaveBeenCalled()
    })

    it('should handle failures', async () => {
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(new Error('Failed'))
      await expect(incrementInvalidPasswordAttempts('123')).rejects.toThrow(
        new Error('Failed')
      )
    })

    it('should handle not found', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(undefined)
      await expect(incrementInvalidPasswordAttempts('123')).rejects.toThrow(
        new Error('Save and exit record 123 not found')
      )
    })
  })

  describe('deleteSaveAndExitRecord', () => {
    it('should delete a save and exit record', async () => {
      jest.mocked(mockCollection.deleteOne.mockResolvedValueOnce({}))
      await deleteSaveAndExitRecord('123')
      const [deletedCall] = mockCollection.deleteOne.mock.calls[0]
      expect(deletedCall).toEqual({ magicLinkId: '123' })
    })

    it('should handle failures', async () => {
      mockCollection.deleteOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(deleteSaveAndExitRecord('123')).rejects.toThrow(
        new Error('Failed')
      )
    })
  })

  describe('findExpiringRecords', () => {
    it('should find expiring records within the specified window', async () => {
      const expiringRecords = [
        { ...submissionDocument, magicLinkId: 'expiring-1' },
        { ...submissionDocument, magicLinkId: 'expiring-2' }
      ]
      mockCollection.find.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValueOnce(expiringRecords)
      })

      const result = await findExpiringRecords(36)

      expect(result).toEqual(expiringRecords)
      const [query] = mockCollection.find.mock.calls[0]
      expect(query).toMatchObject({
        expireAt: { $lte: expect.any(Date), $gt: expect.any(Date) }
      })
    })

    it('should handle failures', async () => {
      mockCollection.find.mockReturnValueOnce({
        toArray: jest.fn().mockRejectedValueOnce(new Error('Failed'))
      })
      await expect(findExpiringRecords(36)).rejects.toThrow(new Error('Failed'))
    })
  })

  describe('lockRecordForExpiryEmail', () => {
    it('should lock a record successfully', async () => {
      const lockedRecord = {
        ...submissionDocument,
        notify: {
          expireLockId: 'runtime-123',
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        },
        version: 2
      }
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(lockedRecord)

      const result = await lockRecordForExpiryEmail(
        'magic-id',
        'runtime-123',
        1
      )

      expect(result).toEqual(lockedRecord)
      const [query, update, options] =
        mockCollection.findOneAndUpdate.mock.calls[0]
      expect(query).toEqual({
        magicLinkId: 'magic-id',
        version: 1,
        $or: [
          { 'notify.expireEmailSentTimestamp': null },
          { 'notify.expireEmailSentTimestamp': { $exists: false } }
        ]
      })
      expect(update).toEqual({
        $set: {
          'notify.expireLockId': 'runtime-123',
          'notify.expireLockTimestamp': expect.any(Date)
        },
        $inc: { version: 1 }
      })
      expect(options).toEqual({ returnDocument: 'after' })
    })

    it('should return null when lock fails', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null)

      const result = await lockRecordForExpiryEmail(
        'magic-id',
        'runtime-123',
        1
      )

      expect(result).toBeNull()
    })

    it('should handle failures', async () => {
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(new Error('Failed'))
      await expect(
        lockRecordForExpiryEmail('magic-id', 'runtime-123', 1)
      ).rejects.toThrow(new Error('Failed'))
    })
  })

  describe('markExpiryEmailSent', () => {
    it('should mark expiry email as sent', async () => {
      const updatedRecord = {
        ...submissionDocument,
        notify: {
          expireLockId: 'runtime-123',
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: new Date()
        }
      }
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(updatedRecord)

      const result = await markExpiryEmailSent('magic-id', 'runtime-123')

      expect(result).toEqual(updatedRecord)
      const [query, update, options] =
        mockCollection.findOneAndUpdate.mock.calls[0]
      expect(query).toEqual({
        magicLinkId: 'magic-id',
        'notify.expireLockId': 'runtime-123'
      })
      expect(update).toEqual({
        $set: {
          'notify.expireEmailSentTimestamp': expect.any(Date)
        }
      })
      expect(options).toEqual({ returnDocument: 'after' })
    })

    it('should return null when lock ID does not match', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null)

      const result = await markExpiryEmailSent('magic-id', 'runtime-123')

      expect(result).toBeNull()
    })

    it('should handle failures', async () => {
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(new Error('Failed'))
      await expect(
        markExpiryEmailSent('magic-id', 'runtime-123')
      ).rejects.toThrow(new Error('Failed'))
    })
  })
})
