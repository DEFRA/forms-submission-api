import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  STUB_SAVE_AND_EXIT_RECORD_ID,
  buildDbDocument
} from '~/src/repositories/__stubs__/save-and-exit.js'
import {
  createSaveAndExitRecord,
  deleteSaveAndExitGroup,
  findExpiringRecords,
  getLatestSaveAndExitByGroup,
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts,
  lockRecordForExpiryEmail,
  markExpiryEmailSent,
  markSaveAndExitRecordAsConsumed,
  resetSaveAndExitRecord
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
    it('should get save and exit record if not comsumed', async () => {
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

  describe('getLatestSaveAndExitByGroup', () => {
    it('should get latest save and exit record by group', async () => {
      const document1WithGroup = {
        ...submissionDocument,
        magicLinkId: 'id1',
        magicLinkGroupId: 'magic-group-id'
      }
      const document2WithGroup = {
        ...submissionDocument,
        magicLinkId: 'id2',
        magicLinkGroupId: 'magic-group-id'
      }
      mockCollection.find.mockReturnValueOnce({
        sort: jest.fn(() => {
          return { toArray: () => [document2WithGroup, document1WithGroup] }
        })
      })
      const submissionRecord =
        await getLatestSaveAndExitByGroup('magic-group-id')
      expect(submissionRecord).toEqual(document2WithGroup)
    })

    it('should handle get latest save and exit record failures', async () => {
      mockCollection.find.mockImplementation(() => {
        throw new Error('an error')
      })
      await expect(
        getLatestSaveAndExitByGroup(STUB_SAVE_AND_EXIT_RECORD_ID)
      ).rejects.toThrow(new Error('an error'))
    })
  })

  describe('createSaveAndExitRecord', () => {
    it('should create a save and exit record when no previous relevant ones', async () => {
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )
      await createSaveAndExitRecord(submissionRecordInput, mockSession)
      const [insertedSubmissionRecordInput, session] =
        mockCollection.insertOne.mock.calls[0]
      expect(insertedSubmissionRecordInput).toEqual({
        ...submissionRecordInput,
        magicLinkGroupId: expect.any(String),
        expireAt: expect.any(Date),
        invalidPasswordAttempts: 0,
        consumed: false
      })
      expect(session).toEqual({ session: mockSession })
    })

    it('should create a save and exit record using existing magicLinkGroupId from previous relevant ones', async () => {
      jest.mocked(
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: 123 })
      )
      await createSaveAndExitRecord(
        {
          ...submissionRecordInput,
          magicLinkGroupId: 'group-id'
        },
        mockSession
      )
      const [insertedSubmissionRecordInput, session] =
        mockCollection.insertOne.mock.calls[0]
      expect(insertedSubmissionRecordInput).toEqual({
        ...submissionRecordInput,
        magicLinkGroupId: 'group-id',
        expireAt: expect.any(Date),
        invalidPasswordAttempts: 0,
        consumed: false
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
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    })

    it('should mark record as consumed if increment max threshold reached', async () => {
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
      expect(mockCollection.updateOne).toHaveBeenCalled()
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

  describe('markSaveAndExitRecordAsConsumed', () => {
    it('should mark a save and exit record as consumed', async () => {
      jest.mocked(mockCollection.updateOne.mockResolvedValueOnce({}))
      await markSaveAndExitRecordAsConsumed('123')
      const [updatededCall] = mockCollection.updateOne.mock.calls[0]
      expect(updatededCall).toEqual({ magicLinkId: '123' })
    })

    it('should handle failures', async () => {
      mockCollection.updateOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(markSaveAndExitRecordAsConsumed('123')).rejects.toThrow(
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
        consumed: { $ne: true },
        version: 1,
        'notify.expireEmailSentTimestamp': null
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
        },
        $inc: { version: 1 }
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

  describe('resetSaveAndExitRecord', () => {
    it('should reset a save and exit record', async () => {
      jest.mocked(mockCollection.updateOne.mockResolvedValueOnce({}))
      await resetSaveAndExitRecord('123')
      const [filter, update] = mockCollection.updateOne.mock.calls[0]
      expect(filter).toEqual({ magicLinkId: '123' })
      expect(update).toEqual({
        $set: { consumed: false, invalidPasswordAttempts: 0 }
      })
    })

    it('should handle failures', async () => {
      mockCollection.updateOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(resetSaveAndExitRecord('123')).rejects.toThrow(
        new Error('Failed')
      )
    })
  })

  describe('deleteSaveAndExitGroup', () => {
    it('should delete all records in a save and exit group', async () => {
      jest.mocked(mockCollection.deleteMany.mockResolvedValueOnce({}))
      await deleteSaveAndExitGroup('group-id', mockSession)
      const [filter] = mockCollection.deleteMany.mock.calls[0]
      expect(filter).toEqual({ magicLinkGroupId: 'group-id' })
    })

    it('should handle failures', async () => {
      mockCollection.deleteMany.mockRejectedValueOnce(new Error('Failed'))
      await expect(
        deleteSaveAndExitGroup('group-id', mockSession)
      ).rejects.toThrow(new Error('Failed'))
    })
  })
})
