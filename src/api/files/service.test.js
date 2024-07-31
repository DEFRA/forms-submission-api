import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import { mockClient } from 'aws-sdk-client-mock'
import { hash, compare } from 'bcrypt'
import { MongoServerError, ObjectId } from 'mongodb'
import { pino } from 'pino'

import * as repository from '~/src/api/files/repository.js'
import { checkExists, ingestFile, getPresignedLink } from '~/src/api/files/service.js'
import { prepareDb } from '~/src/mongo.js'

const s3Mock = mockClient(S3Client)

jest.mock('~/src/api/files/repository.js')
jest.mock('@aws-sdk/s3-request-presigner')
jest.mock('bcrypt')

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
    s3Bucket: 'dummy',
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
      // @ts-expect-error we can't tell the compiler using JSDoc what overloaded function is being mocked, ignore it for now
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
        Boom.badRequest(`File ID '123456' has has already been ingested`)
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

  describe('getFile', () => {
    beforeEach(() => {
      s3Mock.reset()
    })

    it('should get the file previously uploaded', async () => {
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        retrievalKey: 'test'
      }

      jest.mocked(repository.getByFileId).mockResolvedValue({ _id: new ObjectId(), ...dummyData })
      s3Mock.on(GetObjectCommand).resolvesOnce({})
      // @ts-expect-error we can't tell the compiler using JSDoc what overloaded function is being mocked, ignore it for now
      jest.mocked(compare).mockResolvedValue(true)
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
      /** @type {FormFileUploadStatus} */
      const dummyData = {
        ...successfulFile,
        retrievalKey: 'test'
      }

      // @ts-expect-error we can't tell the compiler using JSDoc what overloaded function is being mocked, ignore it for now
      jest.mocked(compare).mockResolvedValue(false)
      jest.mocked(repository.getByFileId).mockResolvedValue({ _id: new ObjectId(), ...dummyData })

      await expect(getPresignedLink('123-456-789', 'test')).rejects.toEqual(
        Boom.forbidden('Retrieval key does not match')
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
