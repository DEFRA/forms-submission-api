import { ObjectId } from 'mongodb'

import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import {
  create,
  getByFileId,
  updateRetrievalKeys,
  updateS3Keys
} from '~/src/repositories/file-repository.js'

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

describe('file repository', () => {
  /** @type {FileUploadStatus} */
  const successfulFile = {
    fileId: '123456',
    filename: 'dummy.txt',
    contentType: 'text/plain',
    s3Key: 'dummy.txt',
    s3Bucket: 'dummy',
    hasError: false,
    fileStatus: 'complete'
  }

  const fileDocument = {
    ...successfulFile,
    formId: '1234',
    retrievalKey: 'test',
    retrievalKeyIsCaseSensitive: true,
    _id: new ObjectId()
  }

  beforeEach(() => {
    jest.mocked(db.collection).mockReturnValue(mockCollection)
  })

  describe('getByFileId', () => {
    it('should get record by file id', async () => {
      mockCollection.findOne.mockReturnValueOnce(fileDocument)
      const fileRecord = await getByFileId(fileDocument.fileId)
      expect(fileRecord).toEqual(fileDocument)
    })

    it('should handle getByFileId failures', async () => {
      mockCollection.findOne.mockImplementation(() => {
        throw new Error('an error')
      })
      await expect(getByFileId(fileDocument.fileId)).rejects.toThrow(
        new Error('an error')
      )
    })

    it('should handle no record found in primary and fallback', async () => {
      mockCollection.findOne
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(fileDocument)
      const fileRecord = await getByFileId(fileDocument.fileId)
      expect(fileRecord).toEqual(fileDocument)
    })

    it('should handle no record found in either primary or fallback', async () => {
      mockCollection.findOne
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(undefined)
      const fileRecord = await getByFileId(fileDocument.fileId)
      expect(fileRecord).toBeUndefined()
    })
  })

  describe('create', () => {
    it('should create a file record', async () => {
      await create(fileDocument)
      const [insertedFileCall] = mockCollection.insertOne.mock.calls[0]
      expect(insertedFileCall).toEqual(fileDocument)
    })

    it('should handle failures', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(create(fileDocument)).rejects.toThrow(new Error('Failed'))
    })
  })

  describe('updateS3Keys', () => {
    const fileArray = [
      {
        fileId: 'file1',
        s3Bucket: 's3Bucket',
        oldS3Key: 'old-key1',
        newS3Key: 'new-key1'
      }
    ]
    it('should update record', async () => {
      await updateS3Keys(fileArray, mockSession)
      const [bulkWriteFileCall] = mockCollection.bulkWrite.mock.calls[0]
      expect(bulkWriteFileCall).toEqual([
        {
          updateOne: {
            filter: {
              fileId: fileArray[0].fileId
            },
            update: [
              {
                $set: {
                  s3Key: 'new-key1'
                }
              }
            ]
          }
        }
      ])
    })
  })

  describe('updateRetrievalKeys', () => {
    const fileIdsArray = ['fileId1', 'fileId2', 'fileId3']
    it('should update retrieval keys', async () => {
      jest
        .mocked(mockCollection.updateMany)
        .mockResolvedValueOnce({ acknowledged: true })
      await updateRetrievalKeys(
        fileIdsArray,
        'retrievalKey',
        false,
        mockSession
      )
      const [updateManyCall] = mockCollection.updateMany.mock.calls[0]
      expect(updateManyCall).toEqual({
        fileId: { $in: ['fileId1', 'fileId2', 'fileId3'] }
      })
    })

    it('should uthrow if failure', async () => {
      jest.mocked(mockCollection.updateMany).mockResolvedValueOnce({})
      await expect(
        updateRetrievalKeys(fileIdsArray, 'retrievalKey', false, mockSession)
      ).rejects.toThrow('Failed to update')
    })
  })
})

/**
 * @import { FileUploadStatus } from '~/src/api/types.js'
 */
