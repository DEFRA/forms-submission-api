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

import * as repository from '~/src/api/files/repository.js'
import {
  checkFileStatus,
  getPresignedLink,
  ingestFile,
  persistFiles,
  submit
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

/**
 * @type {MongoServerError}
 */
const mongoErrorMock = Object.create(MongoServerError.prototype)
mongoErrorMock.errorResponse = {
  code: 11000
}
mongoErrorMock.toString = () => 'dummy'

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

    test('should return file status object', async () => {
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

    it('should correctly handle case sensitivity for the retrieval key', async () => {
      /** @type {FormFileUploadStatus} */
      const mockData = {
        ...successfulFile,
        s3Key: 'staging/dummy-file-123.txt',
        retrievalKey: 'some-key'
      }

      const caseSensitiveKey = 'Some.Name@gov.uk'
      jest.mocked(hash).mockResolvedValueOnce('caseSensitiveHash')
      jest.mocked(verify).mockResolvedValueOnce(true)
      jest.mocked(repository.getByFileId).mockResolvedValueOnce(mockData)

      await persistFiles(
        [
          {
            fileId: mockData.fileId,
            initiatedRetrievalKey: caseSensitiveKey
          }
        ],
        caseSensitiveKey
      )

      expect(hash).toHaveBeenCalledWith(caseSensitiveKey)
      expect(repository.updateRetrievalKeys).toHaveBeenCalledWith(
        [mockData.fileId],
        'caseSensitiveHash',
        true,
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
        true,
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

    test('should create main and repeater file with case sensitivity check', async () => {
      jest.mocked(hash).mockResolvedValue('dummy')

      const dbSpy = jest.spyOn(repository, 'create')

      await submit(submitPayload)

      expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
        Bucket: expect.anything(),
        Key: expect.anything(),
        Body: 'Do you have any food allergies?,Telephone number field\nPeanuts,07800 100200\n',
        ContentType: 'text/csv'
      })

      expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
        Bucket: expect.anything(),
        Key: expect.anything(),
        Body: 'Select a drink,Toppings,Quantity\nCoke,Pepperoni,2\nFanta,Ham,3\n',
        ContentType: 'text/csv'
      })

      expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
        Bucket: expect.anything(),
        Key: expect.anything(),
        Body: 'Name,Age of pet,Address,Favourite drink\nSooty,1,"1 Home Street, Ashford, AB10 1AB","Coke, Fanta"\n',
        ContentType: 'text/csv'
      })

      expect(dbSpy).toHaveBeenCalledTimes(3)

      const dbCreateMatch = {
        fileId: expect.anything(),
        filename: expect.anything(),
        contentType: 'text/csv',
        fileStatus: 'complete',
        detectedContentType: 'text/csv',
        s3Key: expect.stringContaining('loaded/'),
        s3Bucket: expect.anything(),
        retrievalKey: 'dummy',
        retrievalKeyIsCaseSensitive: false
      }

      const dbOperationArgs = dbSpy.mock.calls
      expect(dbOperationArgs[0][0]).toMatchObject(dbCreateMatch)
      expect(dbOperationArgs[0][0].contentLength).toBeGreaterThan(0)
      expect(dbOperationArgs[1][0]).toMatchObject(dbCreateMatch)
      expect(dbOperationArgs[1][0].contentLength).toBeGreaterThan(0)
      expect(dbOperationArgs[2][0]).toMatchObject(dbCreateMatch)
      expect(dbOperationArgs[2][0].contentLength).toBeGreaterThan(0)
    })

    it('should throw 500 internal server error if main save fails', async () => {
      jest.mocked(repository.create).mockRejectedValueOnce(mongoErrorMock)

      await expect(submit(submitPayload)).rejects.toThrow(
        Boom.internal(
          "Failed to save files for session ID '7c675a34-a887-49fc-a1eb-c21006c72a1d'."
        )
      )
    })

    it('should throw 500 internal server error if repeater save fails', async () => {
      jest
        .mocked(repository.create)
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(mongoErrorMock)

      await expect(submit(submitPayload)).rejects.toThrow(
        Boom.internal('Failed to save repeater files')
      )
    })
  })
})

/**
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { FileUploadStatus, FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 */
