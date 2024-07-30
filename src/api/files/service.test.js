import Boom from '@hapi/boom'
import { MongoServerError } from 'mongodb'
import { pino } from 'pino'

import * as repository from '~/src/api/files/repository.js'
import { ingestFile } from '~/src/api/files/service.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/api/files/repository.js')

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

  /** @type {FileUploadStatus} */
  const failedFile = {
    checksumSha256: 'dummy',
    contentLength: 10,
    contentType: 'text/plain',
    detectedContentType: 'text/plain',
    fileId: '123456',
    filename: 'dummy2.txt',
    fileStatus: 'rejected',
    hasError: true,
    errorMessage: 'File has a virus'
  }

  describe('ingestFile', () => {
    test('should upload the file in the payload', async () => {
      /**
       * @type {import('../types.js').UploadPayload}
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

    test('should reject a failed file in the payload', async () => {
      /**
       * @type {import('../types.js').UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: failedFile
        },
        metadata: {
          formId: '123-456-789'
        },
        numberOfRejectedFiles: 1,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValueOnce()

      const dbSpy = jest.spyOn(repository, 'create')

      await expect(ingestFile(uploadPayload)).rejects.toThrow(
        Boom.badRequest(
          `File received which was not complete. Upload ID: 123456, status: rejected.`
        )
      )

      expect(dbSpy).not.toHaveBeenCalled()
    })

    test('should reject when the form ID is not provided', async () => {
      /**
       * @type {import('../types.js').UploadPayload}
       */
      const uploadPayload = {
        form: {
          file: successfulFile
        },
        metadata: {},
        numberOfRejectedFiles: 1,
        uploadStatus: 'ready'
      }

      jest.mocked(repository.create).mockResolvedValueOnce()

      const dbSpy = jest.spyOn(repository, 'create')

      await expect(ingestFile(uploadPayload)).rejects.toThrow(
        Boom.badRequest(`payload.metadata.formId was not provided`)
      )

      expect(dbSpy).not.toHaveBeenCalled()
    })

    test('should reject when the file has already been ingested', async () => {
      /**
       * @type {import('../types.js').UploadPayload}
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
})

/**
 * @template {object} Schema
 * @typedef {import('mongodb').WithId<Schema>} WithId
 */

/**
 * @import { FileUploadStatus } from '~/src/api/types.js'
 */
