import { pino } from 'pino'

import * as repository from '~/src/api/files/repository.js'
import { ingestFile } from '~/src/api/files/service.js'
import { prepareDb } from '~/src/mongo.js'

jest.mock('~/src/api/files/repository.js')
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
jest.useFakeTimers().setSystemTime(new Date('2020-01-01'))

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

    test('should upload all files in the payload', async () => {
      /**
       * @type {import('../types.js').UploadPayload}
       */
      const uploadPayload = {
        form: {
          'file-one': successfulFile,
          'file-two': {
            ...successfulFile,
            filename: 'dummy2.txt'
          }
        },
        metadata: {
          formId: '123-456-789'
        },
        numberOfRejectedFiles: 0,
        uploadStatus: 'ready'
      }

      const dbSpy = jest.spyOn(repository, 'create')

      const uploadCount = await ingestFile(uploadPayload)

      const dbOperationArgs = dbSpy.mock.calls

      expect(dbSpy).toHaveBeenCalledTimes(2)
      expect(dbOperationArgs[0][0]).toMatchObject({
        filename: 'dummy.txt',
        formId: uploadPayload.metadata.formId
      })
      expect(dbOperationArgs[1][0]).toMatchObject({
        filename: 'dummy2.txt',
        formId: uploadPayload.metadata.formId
      })

      expect(uploadCount).toBe(2)
    })

    test('should reject all failed files in the payload', async () => {
      /**
       * @type {import('../types.js').UploadPayload}
       */
      const uploadPayload = {
        form: {
          'file-one': failedFile
        },
        metadata: {
          formId: '123-456-789'
        },
        numberOfRejectedFiles: 1,
        uploadStatus: 'ready'
      }

      const dbSpy = jest.spyOn(repository, 'create')

      const uploadCount = await ingestFile(uploadPayload)

      expect(dbSpy).not.toHaveBeenCalled()
      expect(uploadCount).toBe(0)
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
