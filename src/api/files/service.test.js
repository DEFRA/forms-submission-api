import Boom from '@hapi/boom'
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
    beforeEach(() => {
      jest.mocked(repository.create).mockResolvedValue()
    })

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

      const dbSpy = jest.spyOn(repository, 'create')

      await expect(ingestFile(uploadPayload)).rejects.toThrow(
        Boom.badRequest(
          `File received which was not complete. Upload ID: 123456, status: rejected.`
        )
      )

      expect(dbSpy).not.toHaveBeenCalled()
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
