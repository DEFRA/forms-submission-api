import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import { mockClient } from 'aws-sdk-client-mock'
import { MongoServerError } from 'mongodb'
import { pino } from 'pino'

import * as repository from '~/src/api/files/repository.js'
import { ingestFile, getPresignedLink } from '~/src/api/files/service.js'
import { prepareDb } from '~/src/mongo.js'

const s3Mock = mockClient(S3Client)

jest.mock('~/src/api/files/repository.js')
jest.mock('@aws-sdk/s3-request-presigner')

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
          formId: '123-456-789'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValueOnce()

      const dbSpy = jest.spyOn(repository, 'create')

      await ingestFile(uploadPayload)

      const dbOperationArgs = dbSpy.mock.calls

      expect(dbSpy).toHaveBeenCalledTimes(1)
      expect(dbOperationArgs[0][0]).toMatchObject({
        filename: 'dummy.txt',
        formId: uploadPayload.metadata.formId
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
          formId: '123-456-789'
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
        Boom.badRequest(
          `File ID '123456' for form ID '123-456-789' has already been ingested`
        )
      )
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
        formId: '123-456-789'
      }

      jest.mocked(repository.get).mockResolvedValue(dummyData)
      s3Mock.on(GetObjectCommand).resolvesOnce({})
      jest.mocked(getSignedUrl).mockResolvedValue('https://s3.example/file.txt')

      await expect(getPresignedLink('123456', '123-456-789')).resolves.toBe(
        'https://s3.example/file.txt'
      )
    })

    it('should fail if not found', async () => {
      jest.mocked(repository.get).mockResolvedValue(null)

      await expect(getPresignedLink('123456', '123-456-789')).rejects.toEqual(
        Boom.notFound('File not found')
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
 */
