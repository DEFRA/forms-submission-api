import { ObjectId } from 'mongodb'

import { db } from '~/src/mongo.js'
import { buildMockCollection } from '~/src/repositories/__stubs__/mongo.js'
import { create, getByFileId } from '~/src/repositories/file-repository.js'

const mockCollection = buildMockCollection()

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
  })

  describe('create', () => {
    it('should create a save-and-exit record', async () => {
      await create(fileDocument)
      const [insertedFileCall] = mockCollection.insertOne.mock.calls[0]
      expect(insertedFileCall).toEqual(fileDocument)
    })

    it('should handle failures', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('Failed'))
      await expect(create(fileDocument)).rejects.toThrow(new Error('Failed'))
    })
  })
})

/**
 * @import { FileUploadStatus } from '~/src/api/types.js'
 */
