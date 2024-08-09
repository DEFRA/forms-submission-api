import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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
  checkExists,
  ingestFile,
  getPresignedLink,
  extendTtl
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

    test('should reject when the file has already been ingested', async () => {
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
  })

  describe('checkExists', () => {
    test('should return undefined if file is found', async () => {
      const uploadedFile = {
        ...successfulFile,
        formId: '1234',
        retrievalKey: 'test',
        _id: new ObjectId()
      }

      jest.mocked(repository.getByFileId).mockResolvedValueOnce(uploadedFile)

      await expect(checkExists('1234')).resolves.toBeUndefined()
    })

    test('should throw Not Found when the file does not exist', async () => {
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(null)

      await expect(checkExists('1234')).rejects.toEqual(Boom.notFound())
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

      jest.mocked(repository.getByFileId).mockResolvedValue(dummyData)
      s3Mock.on(GetObjectCommand).resolvesOnce({})
      jest.mocked(verify).mockResolvedValue(true)
      jest.mocked(getSignedUrl).mockResolvedValue('https://s3.example/file.txt')

      await expect(getPresignedLink('123-456-789', 'test')).resolves.toBe(
        'https://s3.example/file.txt'
      )
    })

    it('should fail if not found', async () => {
      jest.mocked(repository.getByFileId).mockResolvedValue(null)

      await expect(getPresignedLink('123-456-789', 'dummy')).rejects.toEqual(
        Boom.notFound('File not found')
      )
    })

    it('should fail if the retrieval key does not match', async () => {
      const dummyData = {
        ...successfulFile,
        _id: new ObjectId(),
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValue(false)
      jest.mocked(repository.getByFileId).mockResolvedValue(dummyData)

      await expect(getPresignedLink('123-456-789', 'test')).rejects.toEqual(
        Boom.forbidden('Retrieval key does not match')
      )
    })
  })

  describe('extendTtl', () => {
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
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(dummyData)

      await extendTtl(dummyData.fileId, dummyData.retrievalKey)

      expect(s3Mock).toHaveReceivedCommandWith(CopyObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: expectedNewKey,
        CopySource: 'dummy-bucket/staging/dummy-file-123.txt'
      })

      expect(repository.updateS3Key).toHaveBeenCalledWith(
        successfulFile.fileId,
        expectedNewKey
      )

      expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: dummyData.s3Key
      })
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

      await extendTtl(dummyData.fileId, dummyData.retrievalKey)

      expect(s3Mock).toHaveReceivedCommandWith(CopyObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: expectedNewKey,
        CopySource:
          'dummy-bucket/staging/extra-level/extra-level-two/dummy-file-123.txt'
      })

      expect(repository.updateS3Key).toHaveBeenCalledWith(
        successfulFile.fileId,
        expectedNewKey
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
        extendTtl(dummyData.fileId, dummyData.retrievalKey)
      ).rejects.toEqual(
        Boom.badRequest(
          `File ID ${dummyData.fileId} has already had its TTL extended`
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
        extendTtl(dummyData.fileId, dummyData.retrievalKey)
      ).rejects.toEqual(
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
        extendTtl(dummyData.fileId, dummyData.retrievalKey)
      ).rejects.toEqual(
        Boom.internal(
          `S3 key/bucket is missing for file ID ${dummyData.fileId}`
        )
      )
    })
  })
})

/**
 * @template {object} Schema
 * @typedef {import('mongodb').WithId<Schema>} WithId
 */

/**
 * @import { FileUploadStatus, FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 * @import { FormMetadata, FormMetadataAuthor } from '@defra/forms-model'
 */
