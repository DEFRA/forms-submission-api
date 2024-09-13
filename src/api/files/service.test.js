import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import { hash, verify } from 'argon2'
import { mockClient } from 'aws-sdk-client-mock'
import { MongoServerError, ObjectId } from 'mongodb'
import { pino } from 'pino'

import * as repository from '~/src/api/files/repository.js'
import {
  checkFileStatus,
  ingestFile,
  getPresignedLink,
  persistFiles
} from '~/src/api/files/service.js'
import { prepareDb } from '~/src/mongo.js'
import 'aws-sdk-client-mock-jest'

const s3Mock = mockClient(S3Client)

jest.mock('~/src/api/files/repository.js')
jest.mock('@aws-sdk/s3-request-presigner')
jest.mock('argon2')

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false

  return {
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

describe('Files service', () => {
  beforeAll(async () => {
    await prepareDb(pino())
  })

  /** @type {FileUploadStatus} */
  const successfulFile = {
    s3Key: 'dummy.txt',
    s3Bucket: 'dummy-bucket',
    checksumSha256: 'dummy',
    contentLength: 1,
    contentType: 'text/plain',
    detectedContentType: 'text/plain',
    fileId: '123456',
    filename: 'dummy.txt',
    fileStatus: 'complete',
    hasError: false
  }

  describe('ingestFile', () => {
    beforeEach(() => {
      s3Mock.reset()
    })

    test('should upload the file in the payload', async () => {
      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: successfulFile
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValueOnce()
      jest.mocked(hash).mockResolvedValueOnce('dummy')

      const dbSpy = jest.spyOn(repository, 'create')

      await ingestFile(uploadPayload)

      const dbOperationArgs = dbSpy.mock.calls

      expect(dbSpy).toHaveBeenCalledTimes(1)
      expect(dbOperationArgs[0][0]).toMatchObject({
        filename: 'dummy.txt',
        retrievalKey: 'dummy'
      })
    })

    test('should throw 400 Bad Request when the file has already been ingested', async () => {
      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: successfulFile
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 1,
        uploadStatus: 'ready'
      }

      /**
       * @type {MongoServerError}
       */
      const mongoErrorMock = Object.create(MongoServerError.prototype)
      mongoErrorMock.errorResponse = {
        code: 11000
      }
      mongoErrorMock.toString = () => 'dummy'

      jest.mocked(repository.create).mockRejectedValueOnce(mongoErrorMock)

      await expect(ingestFile(uploadPayload)).rejects.toThrow(
        Boom.badRequest(`File ID '123456' has already been ingested`)
      )
    })

    it('should throw 400 Bad Request if the file does not actually exist', async () => {
      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: successfulFile
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 1,
        uploadStatus: 'ready'
      }

      s3Mock.on(HeadObjectCommand).rejectsOnce(
        new NotFound({
          message: 'Not found',
          $metadata: {}
        })
      )

      await expect(ingestFile(uploadPayload)).rejects.toThrow(
        Boom.badRequest('File does not exist in S3')
      )
    })
  })

  describe('checkFileStatus', () => {
    beforeEach(() => {
      s3Mock.reset()
    })

    test('should return undefined if file is found', async () => {
      const uploadedFile = {
        ...successfulFile,
        formId: '1234',
        retrievalKey: 'test',
        _id: new ObjectId()
      }

      jest.mocked(repository.getByFileId).mockResolvedValueOnce(uploadedFile)

      await expect(checkFileStatus('1234')).resolves.toBeUndefined()
    })

    test('should throw Not Found when the file does not exist', async () => {
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(null)

      await expect(checkFileStatus('1234')).rejects.toThrow(Boom.notFound())
    })

    test('should throw 410 Gone if file is missing', async () => {
      const dummyData = {
        ...successfulFile,
        s3Key: 'dummy',
        s3Bucket: 'dummy',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)
      s3Mock.on(HeadObjectCommand).rejectsOnce(
        new NotFound({
          message: 'Not found',
          $metadata: {}
        })
      )

      await expect(checkFileStatus('1234')).rejects.toThrow(Boom.resourceGone())
    })
  })

  describe('getPresignedLink', () => {
    beforeEach(() => {
      s3Mock.reset()
    })

    it('should get the file previously uploaded', async () => {
      const dummyData = {
        ...successfulFile,
        _id: new ObjectId(),
        retrievalKey: 'test'
      }

      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)
      s3Mock.on(GetObjectCommand).resolvesOnce({})
      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(getSignedUrl)
        .mockResolvedValueOnce('https://s3.example/file.txt')

      await expect(getPresignedLink('123-456-789', 'test')).resolves.toBe(
        'https://s3.example/file.txt'
      )
    })

    it('should fail if not found', async () => {
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(null)

      await expect(getPresignedLink('123-456-789', 'dummy')).rejects.toThrow(
        Boom.notFound('File not found')
      )
    })

    it('should throw 410 Gone if file is missing', async () => {
      const dummyData = {
        ...successfulFile,
        s3Key: 'dummy',
        s3Bucket: 'dummy',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)
      s3Mock.on(HeadObjectCommand).rejectsOnce(
        new NotFound({
          message: 'Not found',
          $metadata: {}
        })
      )

      await expect(getPresignedLink('123-456-789', 'dummy')).rejects.toThrow(
        Boom.resourceGone()
      )
    })

    it('should fail if the retrieval key does not match', async () => {
      const dummyData = {
        ...successfulFile,
        _id: new ObjectId(),
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(false)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await expect(getPresignedLink(dummyData.fileId, 'test')).rejects.toThrow(
        Boom.forbidden(
          `Retrieval key for file ${dummyData.fileId} is incorrect`
        )
      )
    })
  })

  describe('persistFile', () => {
    const newRetrievalKey = 'newKey'

    beforeEach(() => {
      s3Mock.reset()
    })

    it('should move the file from staging to loaded and delete the old file', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      const expectedNewKey = 'loaded/dummy-file-123.txt'

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(hash).mockResolvedValueOnce('newKeyHash')
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await persistFiles(
        [
          {
            fileId: dummyData.fileId,
            initiatedRetrievalKey: dummyData.retrievalKey
          }
        ],
        newRetrievalKey
      )

      expect(hash).toHaveBeenCalledWith(newRetrievalKey)
      expect(repository.updateRetrievalKeys).toHaveBeenCalledWith(
        [dummyData.fileId],
        'newKeyHash',
        expect.any(Object) // the session which we aren't testing
      )

      expect(repository.updateS3Keys).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            fileId: successfulFile.fileId,
            newS3Key: expectedNewKey
          })
        ]),
        expect.any(Object) // the session which we aren't testing
      )

      expect(s3Mock).toHaveReceivedCommandWith(CopyObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: expectedNewKey,
        CopySource: 'dummy-bucket/staging/dummy-file-123.txt'
      })

      expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: dummyData.s3Key
      })

      expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 1)
      expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: dummyData.s3Key
      })
    })

    it('should fail if one item in the batch fails', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      /** @type {FormFileUploadStatus} */
      const dummyData2 = {
        ...successfulFile,
        s3Key: "staging/path-that-won't-exist.txt",
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(hash).mockResolvedValueOnce('newKeyHash')
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      s3Mock
        .on(CopyObjectCommand)
        .resolvesOnce({}) // first file succeeds
        .rejectsOnce(
          // second file is not found so we expect a rollback
          new NoSuchKey({
            message: 'NoSuchKey',
            $metadata: {}
          })
        )

      await expect(
        persistFiles(
          [
            {
              fileId: dummyData.fileId,
              initiatedRetrievalKey: dummyData.retrievalKey
            },
            {
              fileId: dummyData2.fileId,
              initiatedRetrievalKey: dummyData2.retrievalKey
            }
          ],
          newRetrievalKey
        )
      ).rejects.toBeDefined()

      expect(repository.updateRetrievalKeys).not.toHaveBeenCalled()

      // test the cleanup worked
      expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 1)
      expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: 'loaded/dummy-file-123.txt'
      })
    })

    it("should fail if the retrieval key doesn't match", async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(false)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await expect(
        persistFiles(
          [
            {
              fileId: dummyData.fileId,
              initiatedRetrievalKey: dummyData.retrievalKey
            }
          ],
          newRetrievalKey
        )
      ).rejects.toThrow(
        Boom.forbidden(
          `Retrieval key for file ${dummyData.fileId} is incorrect`
        )
      )

      expect(s3Mock).not.toHaveReceivedAnyCommand()
      expect(repository.updateRetrievalKeys).not.toHaveBeenCalled()
    })

    it('should handle nested input directories', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/extra-level/extra-level-two/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      const expectedNewKey = 'loaded/dummy-file-123.txt'

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await persistFiles(
        [
          {
            fileId: dummyData.fileId,
            initiatedRetrievalKey: dummyData.retrievalKey
          }
        ],
        dummyData.retrievalKey
      )

      expect(s3Mock).toHaveReceivedCommandWith(CopyObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: expectedNewKey,
        CopySource:
          'dummy-bucket/staging/extra-level/extra-level-two/dummy-file-123.txt'
      })

      expect(repository.updateS3Keys).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            fileId: successfulFile.fileId,
            newS3Key: expectedNewKey
          })
        ]),
        expect.any(Object) // the session which we aren't testing
      )

      expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: dummyData.s3Key
      })
    })

    it('should not allow a previously extended file to be extended again', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'loaded/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await expect(
        persistFiles(
          [
            {
              fileId: dummyData.fileId,
              initiatedRetrievalKey: dummyData.retrievalKey
            }
          ],
          dummyData.retrievalKey
        )
      ).rejects.toThrow(
        Boom.badRequest(
          `File ID ${dummyData.fileId} has already been persisted`
        )
      )
    })

    it('should fail if the S3 bucket is missing', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'loaded/dummy-file-123.txt',
        s3Bucket: undefined,
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await expect(
        persistFiles(
          [
            {
              fileId: dummyData.fileId,
              initiatedRetrievalKey: dummyData.retrievalKey
            }
          ],
          dummyData.retrievalKey
        )
      ).rejects.toThrow(
        Boom.internal(
          `S3 key/bucket is missing for file ID ${dummyData.fileId}`
        )
      )
    })

    it('should fail if the S3 key is missing', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: undefined,
        s3Bucket: 'dummy',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await expect(
        persistFiles(
          [
            {
              fileId: dummyData.fileId,
              initiatedRetrievalKey: dummyData.retrievalKey
            }
          ],
          newRetrievalKey
        )
      ).rejects.toThrow(
        Boom.internal(
          `S3 key/bucket is missing for file ID ${dummyData.fileId}`
        )
      )
    })

    it('should throw 410 Gone if the file is missing from S3', async () => {
      const dummyData = {
        ...successfulFile,
        s3Key: 'dummy',
        s3Bucket: 'dummy',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      s3Mock.on(CopyObjectCommand).rejectsOnce(
        new NoSuchKey({
          message: 'NoSuchKey',
          $metadata: {}
        })
      )

      await expect(
        persistFiles(
          [
            {
              fileId: dummyData.fileId,
              initiatedRetrievalKey: dummyData.retrievalKey
            }
          ],
          newRetrievalKey
        )
      ).rejects.toThrow(
        Boom.resourceGone(`File ${dummyData.fileId} no longer exists`)
      )
    })
  })
})

/**
 * @import { FileUploadStatus, FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 */
