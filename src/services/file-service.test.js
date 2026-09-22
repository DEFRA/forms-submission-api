import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import { hash, verify } from 'argon2'
import { mockClient } from 'aws-sdk-client-mock'
import { MongoServerError, ObjectId } from 'mongodb'
import { pino } from 'pino'

import { prepareDb } from '~/src/mongo.js'
import * as repository from '~/src/repositories/file-repository.js'
import {
  cleanupOriginalFiles,
  withPersistFlowCompletionLogging
} from '~/src/services/file-persist-flow.js'
import {
  completePreTransactionPhase,
  createPersistCopyTasks
} from '~/src/services/file-persist-s3copy.js'
import { batchGetFileStatuses } from '~/src/services/file-persist-service.js'
import {
  checkFileStatus,
  getPresignedLink,
  ingestFile,
  persistFiles,
  submit
} from '~/src/services/file-service.js'

import 'aws-sdk-client-mock-jest'

const s3Mock = mockClient(S3Client)

jest.mock('~/src/repositories/file-repository.js')
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

/**
 * @type {MongoServerError}
 */
const mongoErrorMock = Object.create(MongoServerError.prototype)
mongoErrorMock.errorResponse = {
  code: 11000
}
mongoErrorMock.toString = () => 'dummy'

/**
 * Resolves true as soon as the predicate holds, or false once the timeout
 * elapses. Used to prove two operations were in flight at the same time.
 * @param {() => boolean} predicate
 * @param {number} [timeoutMs]
 */
async function waitFor(predicate, timeoutMs = 250) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  return predicate()
}

describe('Files service', () => {
  beforeAll(async () => {
    await prepareDb(pino())
  })

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

  describe('ingestFile', () => {
    beforeEach(() => {
      s3Mock.reset()
    })

    it('should upload the file in the payload', async () => {
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
        fileId: '123456',
        filename: 'dummy.txt',
        contentType: 'text/plain',
        s3Key: 'dummy.txt',
        s3Bucket: 'dummy',
        retrievalKey: 'dummy'
      })
    })

    it('should throw 400 Bad Request when the file has already been ingested', async () => {
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

    it('should rethrow unexpected errors from repository.create', async () => {
      const unexpectedError = new Error('Unexpected database error')

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

      jest.mocked(repository.create).mockRejectedValueOnce(unexpectedError)
      jest.mocked(hash).mockResolvedValueOnce('hashedKey')

      await expect(ingestFile(uploadPayload)).rejects.toThrow(unexpectedError)
    })

    it('should rethrow unexpected errors from assertFileExists', async () => {
      const unexpectedError = new Error('S3 access error')

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

      s3Mock.on(HeadObjectCommand).rejectsOnce(unexpectedError)

      await expect(ingestFile(uploadPayload)).rejects.toThrow(unexpectedError)
    })

    it('should rethrow errors from argon2.hash', async () => {
      const hashError = new Error('Hashing error')

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

      jest.mocked(hash).mockRejectedValueOnce(hashError)

      await expect(ingestFile(uploadPayload)).rejects.toThrow(hashError)
    })

    it('should handle ingestion when optional fields are present', async () => {
      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: {
            ...successfulFile,
            hasError: true,
            errorMessage: 'Sample error message'
          }
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValueOnce()
      jest.mocked(hash).mockResolvedValueOnce('dummy')

      await ingestFile(uploadPayload)

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: '123456',
          filename: 'dummy.txt',
          contentType: 'text/plain',
          s3Key: 'dummy.txt',
          s3Bucket: 'dummy',
          retrievalKey: 'dummy'
        })
      )
    })

    it('should ingest multiple files from an array payload', async () => {
      /** @type {FileUploadStatus} */
      const secondFile = {
        fileId: '789012',
        filename: 'second.pdf',
        contentType: 'application/pdf',
        s3Key: 'second.pdf',
        s3Bucket: 'dummy',
        hasError: false,
        fileStatus: 'complete'
      }

      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: [successfulFile, secondFile]
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValue()
      jest.mocked(hash).mockResolvedValueOnce('dummy')

      const dbSpy = jest.spyOn(repository, 'create')

      await ingestFile(uploadPayload)

      expect(dbSpy).toHaveBeenCalledTimes(2)
      expect(dbSpy.mock.calls[0][0]).toMatchObject({
        fileId: '123456',
        filename: 'dummy.txt',
        contentType: 'text/plain',
        s3Key: 'dummy.txt',
        s3Bucket: 'dummy',
        retrievalKey: 'dummy'
      })
      expect(dbSpy.mock.calls[1][0]).toMatchObject({
        fileId: '789012',
        filename: 'second.pdf',
        contentType: 'application/pdf',
        s3Key: 'second.pdf',
        s3Bucket: 'dummy',
        retrievalKey: 'dummy'
      })
    })

    it('should hash the retrieval key only once for multiple files', async () => {
      /** @type {FileUploadStatus} */
      const secondFile = {
        fileId: '789012',
        filename: 'second.pdf',
        contentType: 'application/pdf',
        s3Key: 'second.pdf',
        s3Bucket: 'dummy',
        hasError: false,
        fileStatus: 'complete'
      }

      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: [successfulFile, secondFile]
        },
        metadata: {
          retrievalKey: 'Test@Example.com'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValue()
      jest.mocked(hash).mockResolvedValueOnce('hashed')

      await ingestFile(uploadPayload)

      expect(hash).toHaveBeenCalledTimes(1)
      expect(hash).toHaveBeenCalledWith('test@example.com')
    })

    it('should check the file exists in S3 while the retrieval key is still being hashed', async () => {
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

      let headCalled = false
      let headSeenWhileHashPending = false

      s3Mock.on(HeadObjectCommand).callsFake(() => {
        headCalled = true
        return {}
      })
      jest.mocked(hash).mockImplementationOnce(async () => {
        headSeenWhileHashPending = await waitFor(() => headCalled)
        return 'dummy'
      })
      jest.mocked(repository.create).mockResolvedValue()

      await ingestFile(uploadPayload)

      expect(headSeenWhileHashPending).toBe(true)
    })

    it('should report the hashing error, not an unhandled rejection, when hashing and every S3 check fail', async () => {
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

      const hashError = new Error('hash failed')
      const unhandled = jest.fn()

      process.on('unhandledRejection', unhandled)

      try {
        jest.mocked(hash).mockRejectedValueOnce(hashError)
        s3Mock.on(HeadObjectCommand).rejectsOnce(
          new NotFound({
            message: 'Not found',
            $metadata: {}
          })
        )

        await expect(ingestFile(uploadPayload)).rejects.toThrow(hashError)

        // Give the event loop a turn so any unhandled rejection would surface
        await new Promise((resolve) => setImmediate(resolve))

        expect(unhandled).not.toHaveBeenCalled()
        expect(repository.create).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', unhandled)
      }
    })

    it('should throw if any file in a multi-file payload does not exist in S3', async () => {
      /** @type {FileUploadStatus} */
      const secondFile = {
        fileId: '789012',
        filename: 'second.pdf',
        contentType: 'application/pdf',
        s3Key: 'second.pdf',
        s3Bucket: 'dummy',
        hasError: false,
        fileStatus: 'complete'
      }

      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: [successfulFile, secondFile]
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(hash).mockResolvedValueOnce('dummy')

      // First file passes HeadObject, second fails
      s3Mock
        .on(HeadObjectCommand)
        .resolvesOnce({})
        .rejectsOnce(
          new NotFound({
            message: 'Not found',
            $metadata: {}
          })
        )

      jest.mocked(repository.create).mockResolvedValueOnce()

      await expect(ingestFile(uploadPayload)).rejects.toThrow(
        Boom.badRequest('File does not exist in S3')
      )
    })

    it('should skip rejected files and only ingest complete files', async () => {
      /** @type {FileUploadStatus} */
      const rejectedFile = {
        fileId: '789012',
        filename: 'virus.exe',
        contentType: 'application/octet-stream',
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'File contains a virus'
      }

      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: [successfulFile, rejectedFile]
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 1,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValue()
      jest.mocked(hash).mockResolvedValueOnce('dummy')

      const dbSpy = jest.spyOn(repository, 'create')

      await ingestFile(uploadPayload)

      // Only the complete file should be ingested
      expect(dbSpy).toHaveBeenCalledTimes(1)
      expect(dbSpy.mock.calls[0][0]).toMatchObject({
        fileId: '123456',
        filename: 'dummy.txt',
        s3Key: 'dummy.txt',
        s3Bucket: 'dummy',
        retrievalKey: 'dummy'
      })
    })

    it('should return early without hashing when all files are rejected', async () => {
      /** @type {FileUploadStatus} */
      const rejectedFile1 = {
        fileId: '111111',
        filename: 'virus1.exe',
        contentType: 'application/octet-stream',
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'File contains a virus'
      }

      /** @type {FileUploadStatus} */
      const rejectedFile2 = {
        fileId: '222222',
        filename: 'virus2.exe',
        contentType: 'application/octet-stream',
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'File type not allowed'
      }

      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: [rejectedFile1, rejectedFile2]
        },
        metadata: {
          retrievalKey: 'test'
        },
        numberOfRejectedFiles: 2,
        uploadStatus: 'ready'
      }

      await ingestFile(uploadPayload)

      // No hashing or DB writes should occur
      expect(hash).not.toHaveBeenCalled()
      expect(repository.create).not.toHaveBeenCalled()
    })

    it('should handle ingestion with empty strings as valid values', async () => {
      /**
       * @type {UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: {
            ...successfulFile,
            filename: '',
            contentType: '',
            s3Key: '',
            s3Bucket: ''
          }
        },
        metadata: {
          retrievalKey: ''
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValueOnce()
      jest.mocked(hash).mockResolvedValueOnce('hashedEmptyString')

      await ingestFile(uploadPayload)

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: '',
          contentType: '',
          s3Key: '',
          s3Bucket: '',
          retrievalKey: 'hashedEmptyString'
        })
      )
    })
  })

  describe('checkFileStatus', () => {
    beforeEach(() => {
      s3Mock.reset()
    })

    it('should return undefined if file is found', async () => {
      const uploadedFile = {
        ...successfulFile,
        formId: '1234',
        retrievalKey: 'test',
        retrievalKeyIsCaseSensitive: true,
        _id: new ObjectId()
      }

      jest.mocked(repository.getByFileId).mockResolvedValueOnce(uploadedFile)

      const result = await checkFileStatus('1234')
      expect(result).toEqual(uploadedFile)
    })

    it('should throw Not Found when the file does not exist', async () => {
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(null)

      await expect(checkFileStatus('1234')).rejects.toThrow(Boom.notFound())
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

    it('should look up all files in the batch with a single call to getByFileIds', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        fileId: 'file-1',
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'hash-1'
      }
      /** @type {FormFileUploadStatus} */
      const dummyData2 = {
        ...successfulFile,
        fileId: 'file-2',
        s3Key: 'staging/dummy-file-456.txt',
        retrievalKey: 'hash-2'
      }

      jest.mocked(hash).mockResolvedValueOnce('newKeyHash')
      jest.mocked(verify).mockResolvedValue(true)
      jest.mocked(repository.getByFileIds).mockResolvedValueOnce(
        new Map([
          [dummyData.fileId, dummyData],
          [dummyData2.fileId, dummyData2]
        ])
      )

      await persistFiles(
        [
          { fileId: dummyData.fileId, initiatedRetrievalKey: 'key-1' },
          { fileId: dummyData2.fileId, initiatedRetrievalKey: 'key-2' }
        ],
        newRetrievalKey
      )

      expect(repository.getByFileIds).toHaveBeenCalledTimes(1)
      expect(repository.getByFileIds).toHaveBeenCalledWith([
        dummyData.fileId,
        dummyData2.fileId
      ])
      expect(repository.getByFileId).not.toHaveBeenCalled()
    })

    it('should only call argon2.verify once for files sharing an identical stored hash and plaintext key', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        fileId: 'file-1',
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'shared-hash'
      }
      /** @type {FormFileUploadStatus} */
      const dummyData2 = {
        ...successfulFile,
        fileId: 'file-2',
        s3Key: 'staging/dummy-file-456.txt',
        retrievalKey: 'shared-hash'
      }

      jest.mocked(hash).mockResolvedValueOnce('newKeyHash')
      jest.mocked(verify).mockResolvedValue(true)
      jest.mocked(repository.getByFileIds).mockResolvedValueOnce(
        new Map([
          [dummyData.fileId, dummyData],
          [dummyData2.fileId, dummyData2]
        ])
      )

      await persistFiles(
        [
          { fileId: dummyData.fileId, initiatedRetrievalKey: 'same-key' },
          { fileId: dummyData2.fileId, initiatedRetrievalKey: 'same-key' }
        ],
        newRetrievalKey
      )

      expect(verify).toHaveBeenCalledTimes(1)
      expect(verify).toHaveBeenCalledWith('shared-hash', 'same-key')
    })

    it('should call argon2.verify separately for files with different stored hashes', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        fileId: 'file-1',
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'hash-1'
      }
      /** @type {FormFileUploadStatus} */
      const dummyData2 = {
        ...successfulFile,
        fileId: 'file-2',
        s3Key: 'staging/dummy-file-456.txt',
        retrievalKey: 'hash-2'
      }

      jest.mocked(hash).mockResolvedValueOnce('newKeyHash')
      jest.mocked(verify).mockResolvedValue(true)
      jest.mocked(repository.getByFileIds).mockResolvedValueOnce(
        new Map([
          [dummyData.fileId, dummyData],
          [dummyData2.fileId, dummyData2]
        ])
      )

      await persistFiles(
        [
          { fileId: dummyData.fileId, initiatedRetrievalKey: 'same-key' },
          { fileId: dummyData2.fileId, initiatedRetrievalKey: 'same-key' }
        ],
        newRetrievalKey
      )

      expect(verify).toHaveBeenCalledTimes(2)
    })

    it('should correctly handle case insensitivity for the retrieval key', async () => {
      /** @type {FormFileUploadStatus} */
      const mockData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'some-key'
      }

      const caseSensitiveKey = 'Some.Name@gov.uk'
      jest.mocked(hash).mockResolvedValueOnce('caseSensitiveHash')
      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[mockData.fileId, mockData]]))

      await persistFiles(
        [
          {
            fileId: mockData.fileId,
            initiatedRetrievalKey: caseSensitiveKey
          }
        ],
        caseSensitiveKey
      )

      expect(hash).toHaveBeenCalledWith(caseSensitiveKey.toLowerCase())
      expect(repository.updateRetrievalKeys).toHaveBeenCalledWith(
        [mockData.fileId],
        'caseSensitiveHash',
        false,
        expect.any(Object)
      )
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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

      await persistFiles(
        [
          {
            fileId: dummyData.fileId,
            initiatedRetrievalKey: dummyData.retrievalKey
          }
        ],
        newRetrievalKey
      )

      expect(hash).toHaveBeenCalledWith(newRetrievalKey.toLowerCase())
      expect(repository.updateRetrievalKeys).toHaveBeenCalledWith(
        [dummyData.fileId],
        'newKeyHash',
        false,
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
        CopySource: `${successfulFile.s3Bucket}/staging/dummy-file-123.txt`
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

    it('should hash the persisted retrieval key while files are still being copied', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      let hashStartedDuringCopy = false

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(hash).mockResolvedValueOnce('newKeyHash')
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))
      s3Mock.on(CopyObjectCommand).callsFake(async () => {
        hashStartedDuringCopy = await waitFor(
          () => jest.mocked(hash).mock.calls.length > 0
        )
        return {}
      })

      await persistFiles(
        [
          {
            fileId: dummyData.fileId,
            initiatedRetrievalKey: dummyData.retrievalKey
          }
        ],
        newRetrievalKey
      )

      expect(hashStartedDuringCopy).toBe(true)
    })

    it('should remove the copied files and leave the database untouched when hashing fails', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(hash).mockRejectedValueOnce(new Error('hash failed'))
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

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
      ).rejects.toThrow('hash failed')

      expect(repository.updateS3Keys).not.toHaveBeenCalled()
      expect(repository.updateRetrievalKeys).not.toHaveBeenCalled()

      // The newly copied file is removed; the original staging file is kept
      expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
        Bucket: successfulFile.s3Bucket,
        Key: 'loaded/dummy-file-123.txt'
      })
      expect(s3Mock).not.toHaveReceivedCommandWith(DeleteObjectCommand, {
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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

      s3Mock
        .on(CopyObjectCommand)
        .resolvesOnce({}) // first file succeeds
        .rejectsOnce(
          // second file's copy fails so we expect a rollback
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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

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
        CopySource: `${successfulFile.s3Bucket}/staging/extra-level/extra-level-two/dummy-file-123.txt`
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

    it('should allow a previously extended file to be extended again', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        s3Key: 'loaded/dummy-file-123.txt',
        retrievalKey: 'test'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

      jest.mocked(hash).mockResolvedValueOnce('caseSensitiveHash')
      jest.mocked(verify).mockResolvedValueOnce(true)

      await persistFiles(
        [
          {
            fileId: dummyData.fileId,
            initiatedRetrievalKey: dummyData.retrievalKey
          }
        ],
        dummyData.retrievalKey
      )

      expect(hash).toHaveBeenCalledWith(dummyData.retrievalKey.toLowerCase())
      expect(repository.updateRetrievalKeys).toHaveBeenCalledWith(
        [dummyData.fileId],
        'caseSensitiveHash',
        false,
        expect.any(Object)
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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

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
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

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

    it('should rethrow unexpected S3 copy errors', async () => {
      const dummyData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'test'
      }
      const unexpectedError = new Error('Unexpected S3 failure')

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[dummyData.fileId, dummyData]]))

      s3Mock.on(CopyObjectCommand).rejectsOnce(unexpectedError)

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
      ).rejects.toThrow(unexpectedError)

      expect(repository.updateRetrievalKeys).not.toHaveBeenCalled()
    })

    it('should update both retrievalKey and retrievalKeyIsCaseSensitive fields', async () => {
      /** @type {FormFileUploadStatus} */
      const mockData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'some-key'
      }

      jest.mocked(hash).mockResolvedValueOnce('hashedKey')
      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[mockData.fileId, mockData]]))

      await persistFiles(
        [
          { fileId: mockData.fileId, initiatedRetrievalKey: 'someEmail@gov.uk' }
        ],
        'someEmail@gov.uk'
      )

      expect(repository.updateRetrievalKeys).toHaveBeenCalledWith(
        [mockData.fileId],
        'hashedKey',
        false,
        expect.any(Object)
      )
    })

    it('should handle errors when updating multiple fields', async () => {
      /** @type {FormFileUploadStatus} */
      const mockData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'some-key'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[mockData.fileId, mockData]]))

      // Mock updateMany to return unacknowledged result
      jest.mocked(repository.updateRetrievalKeys).mockImplementationOnce(() => {
        throw new Error(
          'Failed to update retrievalKey, retrievalKeyIsCaseSensitive'
        )
      })

      await expect(
        persistFiles(
          [
            {
              fileId: mockData.fileId,
              initiatedRetrievalKey: 'someEmail@gov.uk'
            }
          ],
          'someEmail@gov.uk'
        )
      ).rejects.toThrow(
        'Failed to update retrievalKey, retrievalKeyIsCaseSensitive'
      )
    })

    it('should handle unacknowledged database updates', async () => {
      /** @type {FormFileUploadStatus} */
      const mockData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'some-key'
      }

      jest.mocked(verify).mockResolvedValueOnce(true)
      jest
        .mocked(repository.getByFileIds)
        .mockResolvedValueOnce(new Map([[mockData.fileId, mockData]]))

      jest.mocked(repository.updateRetrievalKeys).mockImplementationOnce(() => {
        throw new Error(
          'Failed to update retrievalKey, retrievalKeyIsCaseSensitive'
        )
      })

      await expect(
        persistFiles(
          [
            {
              fileId: mockData.fileId,
              initiatedRetrievalKey: 'someEmail@gov.uk'
            }
          ],
          'someEmail@gov.uk'
        )
      ).rejects.toThrow(
        'Failed to update retrievalKey, retrievalKeyIsCaseSensitive'
      )
    })
  })

  describe('submit', () => {
    /**
     * @type {SubmitPayload}
     */
    const submitPayload = {
      sessionId: '7c675a34-a887-49fc-a1eb-c21006c72a1d',
      retrievalKey: 'enrique.chase@defra.gov.uk',
      main: [
        {
          name: 'DfrtG',
          title: 'Do you have any food allergies?',
          value: 'Peanuts'
        },
        {
          name: 'XIPMNK',
          title: 'Telephone number field',
          value: '07800 100200'
        }
      ],
      repeaters: [
        {
          name: 'w3E5gf',
          title: 'Pizza',
          value: [
            [
              {
                name: 'dyLdCy',
                title: 'Select a drink',
                value: 'Coke'
              },
              {
                name: 'sQsXKK',
                title: 'Toppings',
                value: 'Pepperoni'
              },
              {
                name: 'VcmoiL',
                title: 'Quantity',
                value: '2'
              }
            ],
            [
              {
                name: 'dyLdCy',
                title: 'Select a drink',
                value: 'Fanta'
              },
              {
                name: 'sQsXKK',
                title: 'Toppings',
                value: 'Ham'
              },
              {
                name: 'VcmoiL',
                title: 'Quantity',
                value: '3'
              }
            ]
          ]
        },
        {
          name: 'hYbDko',
          title: 'Pet',
          value: [
            [
              {
                name: 'rxZZVr',
                title: 'Name',
                value: 'Sooty'
              },
              {
                name: 'oOExDF',
                title: 'Age of pet',
                value: '1'
              },
              {
                name: 'hSKXzi',
                title: 'Address',
                value: '1 Home Street, Ashford, AB10 1AB'
              },
              {
                name: 'mDHsye',
                title: 'Favourite drink',
                value: 'Coke, Fanta'
              }
            ]
          ]
        }
      ]
    }

    beforeEach(() => {
      s3Mock.reset()
    })

    it('should create main and repeater file', async () => {
      jest.mocked(hash).mockResolvedValue('dummy')

      const dbSpy = jest.spyOn(repository, 'create')

      await submit(submitPayload)

      expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
        Bucket: expect.anything(),
        Key: expect.anything(),
        // stringContaining so BOM code can be ignored in string comparison
        Body: expect.stringContaining(
          'Do you have any food allergies?,Telephone number field\nPeanuts,07800 100200\n'
        ),
        ContentType: 'text/csv'
      })

      expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
        Bucket: expect.anything(),
        Key: expect.anything(),
        // stringContaining so BOM code can be ignored in string comparison
        Body: expect.stringContaining(
          'Select a drink,Toppings,Quantity\nCoke,Pepperoni,2\nFanta,Ham,3\n'
        ),
        ContentType: 'text/csv'
      })

      expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
        Bucket: expect.anything(),
        Key: expect.anything(),
        // stringContaining so BOM code can be ignored in string comparison
        Body: expect.stringContaining(
          'Name,Age of pet,Address,Favourite drink\nSooty,1,"1 Home Street, Ashford, AB10 1AB","Coke, Fanta"\n'
        ),
        ContentType: 'text/csv'
      })

      expect(dbSpy).toHaveBeenCalledTimes(3)

      const dbCreateMatch = {
        fileId: expect.anything(),
        filename: expect.anything(),
        contentType: 'text/csv',
        s3Key: expect.stringContaining('loaded/'),
        s3Bucket: expect.anything(),
        retrievalKey: 'dummy',
        retrievalKeyIsCaseSensitive: false
      }

      const dbOperationArgs = dbSpy.mock.calls
      expect(dbOperationArgs[0][0]).toMatchObject(dbCreateMatch)
      expect(dbOperationArgs[1][0]).toMatchObject(dbCreateMatch)
      expect(dbOperationArgs[2][0]).toMatchObject(dbCreateMatch)
    })

    /**
     * Records the S3 key of the main CSV as it is uploaded. The main and
     * repeater files are saved concurrently, so failures must be aimed at a
     * file by its content rather than by the order the saves happen to run in.
     */
    function trackMainCsvKey() {
      /** @type {{ key: string | undefined }} */
      const main = { key: undefined }

      s3Mock.on(PutObjectCommand).callsFake((input) => {
        if (
          typeof input.Body === 'string' &&
          input.Body.includes('Do you have any food allergies?')
        ) {
          main.key = input.Key
        }

        return {}
      })

      return main
    }

    it('should save the main and repeater files concurrently', async () => {
      jest.mocked(hash).mockResolvedValue('dummy')

      let repeaterUploadStarted = false
      let repeaterStartedWhileMainUploading = false

      s3Mock.on(PutObjectCommand).callsFake(async (input) => {
        const isMain =
          typeof input.Body === 'string' &&
          input.Body.includes('Do you have any food allergies?')

        if (isMain) {
          repeaterStartedWhileMainUploading = await waitFor(
            () => repeaterUploadStarted
          )
        } else {
          repeaterUploadStarted = true
        }

        return {}
      })

      await submit(submitPayload)

      expect(repeaterStartedWhileMainUploading).toBe(true)
    })

    it('should throw 500 internal server error if main save fails', async () => {
      const main = trackMainCsvKey()

      jest
        .mocked(repository.create)
        .mockImplementation((fileStatus) =>
          fileStatus.s3Key === main.key
            ? Promise.reject(mongoErrorMock)
            : Promise.resolve()
        )

      await expect(submit(submitPayload)).rejects.toThrow(
        Boom.internal(
          "Failed to save files for session ID '7c675a34-a887-49fc-a1eb-c21006c72a1d'."
        )
      )
    })

    it('should throw 500 internal server error if repeater save fails', async () => {
      const main = trackMainCsvKey()

      jest
        .mocked(repository.create)
        .mockImplementation((fileStatus) =>
          fileStatus.s3Key === main.key
            ? Promise.resolve()
            : Promise.reject(mongoErrorMock)
        )

      await expect(submit(submitPayload)).rejects.toThrow(
        Boom.internal('Failed to save repeater files')
      )
    })

    it('should report the main file failure when both main and repeater saves fail', async () => {
      jest.mocked(repository.create).mockRejectedValue(mongoErrorMock)

      await expect(submit(submitPayload)).rejects.toThrow(
        Boom.internal(
          "Failed to save files for session ID '7c675a34-a887-49fc-a1eb-c21006c72a1d'."
        )
      )
    })
  })

  describe('file persist service helpers', () => {
    describe('batchGetFileStatuses', () => {
      it('should report a unique verify count of 1 when files share an identical stored hash and plaintext key', async () => {
        const perfLoggerFns = { info: jest.fn() }
        const perfLogger = /** @type {import('pino').Logger} */ (
          /** @type {unknown} */ (perfLoggerFns)
        )
        const fileA = { ...successfulFile, fileId: 'file-a' }
        const fileB = { ...successfulFile, fileId: 'file-b' }

        jest.mocked(repository.getByFileIds).mockResolvedValueOnce(
          new Map([
            [fileA.fileId, { ...fileA, retrievalKey: 'shared-hash' }],
            [fileB.fileId, { ...fileB, retrievalKey: 'shared-hash' }]
          ])
        )

        await batchGetFileStatuses(
          [
            { fileId: fileA.fileId, initiatedRetrievalKey: 'same-key' },
            { fileId: fileB.fileId, initiatedRetrievalKey: 'same-key' }
          ],
          perfLogger
        )

        expect(perfLoggerFns.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'files.persist.verify_dedup'
            })
          }),
          '[persistFiles:perf] Retrieval key verification dedup summary (uniqueVerifyCount=1 fileCount=2)'
        )
      })

      it('should report a unique verify count of 2 when files have different stored hashes', async () => {
        const perfLoggerFns = { info: jest.fn() }
        const perfLogger = /** @type {import('pino').Logger} */ (
          /** @type {unknown} */ (perfLoggerFns)
        )
        const fileA = { ...successfulFile, fileId: 'file-a' }
        const fileB = { ...successfulFile, fileId: 'file-b' }

        jest.mocked(repository.getByFileIds).mockResolvedValueOnce(
          new Map([
            [fileA.fileId, { ...fileA, retrievalKey: 'hash-1' }],
            [fileB.fileId, { ...fileB, retrievalKey: 'hash-2' }]
          ])
        )

        await batchGetFileStatuses(
          [
            { fileId: fileA.fileId, initiatedRetrievalKey: 'same-key' },
            { fileId: fileB.fileId, initiatedRetrievalKey: 'same-key' }
          ],
          perfLogger
        )

        expect(perfLoggerFns.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'files.persist.verify_dedup'
            })
          }),
          '[persistFiles:perf] Retrieval key verification dedup summary (uniqueVerifyCount=2 fileCount=2)'
        )
      })
    })
  })

  describe('file persist flow helpers', () => {
    it('should skip original file cleanup when no updated files exist', async () => {
      const clientFns = {
        send: jest.fn()
      }
      const perfLoggerFns = {
        info: jest.fn()
      }
      const client = /** @type {import('@aws-sdk/client-s3').S3Client} */ (
        /** @type {unknown} */ (clientFns)
      )
      const perfLogger = /** @type {import('pino').Logger} */ (
        /** @type {unknown} */ (perfLoggerFns)
      )

      await cleanupOriginalFiles([], [], client, perfLogger)

      expect(clientFns.send).not.toHaveBeenCalled()
      expect(perfLoggerFns.info).not.toHaveBeenCalled()
    })

    it('should log Unknown error when wrapped persist flow throws a non-Error value', async () => {
      const perfLoggerFns = {
        info: jest.fn(),
        warn: jest.fn()
      }
      const perfLogger = /** @type {import('pino').Logger} */ (
        /** @type {unknown} */ (perfLoggerFns)
      )
      const totalTimer = {
        elapsed: 42
      }
      const operation = jest.fn().mockRejectedValueOnce('boom')

      await expect(
        withPersistFlowCompletionLogging(perfLogger, totalTimer, operation)
      ).rejects.toBe('boom')

      expect(perfLoggerFns.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            message: 'Unknown error'
          },
          event: expect.objectContaining({
            action: 'files.persist.flow',
            category: 'process',
            duration: 42,
            outcome: 'failure',
            reason: 'Unknown error',
            type: 'end'
          })
        }),
        '[persistFiles:perf] Persist flow completed'
      )
    })
  })

  describe('file persist copy helpers', () => {
    it('should report zero timing summary values when no files need copying', async () => {
      const perfLoggerFns = {
        info: jest.fn()
      }
      const perfLogger = /** @type {import('pino').Logger} */ (
        /** @type {unknown} */ (perfLoggerFns)
      )

      const copiedFiles = await completePreTransactionPhase([], perfLogger)

      expect(copiedFiles).toEqual([])
      expect(perfLoggerFns.info).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'files.persist.pre_transaction',
            category: 'process',
            duration: expect.any(Number),
            kind: 'event',
            outcome: 'success',
            type: 'end'
          })
        }),
        '[persistFiles:perf] Pre-transaction verification and copy phase completed (copiedCount=0 fileCount=0 skippedCopyCount=0)'
      )
      expect(perfLoggerFns.info).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'files.persist.summary.lookup'
          })
        }),
        expect.stringContaining('Mongo lookup timing summary')
      )
      expect(perfLoggerFns.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'files.persist.summary.verify',
            category: 'process',
            duration: 0,
            kind: 'metric',
            outcome: 'success',
            type: 'info'
          })
        }),
        '[persistFiles:perf] Retrieval key verification timing summary (averageMs=0 fileCount=0 maxMs=0)'
      )
      expect(perfLoggerFns.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'files.persist.summary.copy',
            category: 'file',
            duration: 0,
            kind: 'metric',
            outcome: 'success',
            type: 'info'
          })
        }),
        '[persistFiles:perf] S3 copy timing summary (averageMs=0 fileCount=0 maxMs=0)'
      )
      expect(perfLoggerFns.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'files.persist.summary.file_total',
            category: 'process',
            duration: 0,
            kind: 'metric',
            outcome: 'success',
            type: 'info'
          })
        }),
        '[persistFiles:perf] Per-file total timing summary (averageMs=0 fileCount=0 maxMs=0)'
      )
    })

    it('should rethrow non-Error S3 copy failures from copy task creation', async () => {
      const clientFns = {
        send: jest.fn().mockRejectedValueOnce('Unexpected S3 failure')
      }
      const perfLoggerFns = {
        child: jest.fn()
      }
      const client = /** @type {import('@aws-sdk/client-s3').S3Client} */ (
        /** @type {unknown} */ (clientFns)
      )
      const perfLogger = /** @type {import('pino').Logger} */ (
        /** @type {unknown} */ (perfLoggerFns)
      )
      const getAndVerify = jest.fn().mockResolvedValue({
        fileId: successfulFile.fileId,
        s3Bucket: successfulFile.s3Bucket,
        s3Key: 'staging/dummy-file-123.txt'
      })

      const copyTasks = createPersistCopyTasks(
        [
          {
            fileId: successfulFile.fileId,
            initiatedRetrievalKey: 'test'
          }
        ],
        client,
        perfLogger,
        getAndVerify
      )

      await expect(Promise.all(copyTasks)).rejects.toBe('Unexpected S3 failure')
    })
  })
})

/**
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { FileUploadStatus, FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 */
