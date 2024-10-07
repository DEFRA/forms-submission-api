import { StatusCodes } from 'http-status-codes'

import {
  checkFileStatus,
  getPresignedLink,
  ingestFile,
  persistFiles
} from '~/src/api/files/service.js'
import { createServer } from '~/src/api/server.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/api/files/service.js')

describe('Forms route', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
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

  describe('Success responses', () => {
    test('Testing POST /file route returns an S3 link', async () => {
      jest.mocked(ingestFile).mockResolvedValue()

      const response = await server.inject({
        method: 'POST',
        url: '/file',
        payload: {
          uploadStatus: 'ready',
          metadata: {
            retrievalKey: 'test'
          },
          form: {
            'ignored-key': 'value',
            file: successfulFile
          },
          numberOfRejectedFiles: 0
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion completed'
      })
    })

    test('Testing GET /file/{uploadId} route returns success', async () => {
      jest.mocked(checkFileStatus).mockResolvedValue()

      const response = await server.inject({
        method: 'GET',
        url: '/file/12345'
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Found'
      })
    })

    test('Testing POST /file/link route returns an S3 link', async () => {
      jest
        .mocked(getPresignedLink)
        .mockResolvedValue('https://s3.dummy.com/file.txt')

      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        auth,
        payload: {
          fileId: '1234',
          retrievalKey: 'test'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.result).toMatchObject({
        url: 'https://s3.dummy.com/file.txt'
      })
    })

    test('Testing POST /files/persist route returns success', async () => {
      jest.mocked(persistFiles).mockResolvedValue()

      const response = await server.inject({
        method: 'POST',
        url: '/files/persist',
        auth,
        payload: {
          files: [
            {
              fileId: '1234',
              initiatedRetrievalKey: '1234'
            }
          ],
          persistedRetrievalKey: '5678'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.result).toMatchObject({
        message: 'Files persisted'
      })
    })
  })

  describe('Error responses', () => {
    test('Testing POST /file route fails if file is rejected', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/file`,
        payload: {
          uploadStatus: 'ready',
          metadata: {
            retrievalKey: 'test'
          },
          form: {
            'ignored-key': 'value',
            file: {
              ...successfulFile,
              fileStatus: 'rejected'
            }
          },
          numberOfRejectedFiles: 1
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion failed'
      })
    })

    test('Testing POST /file route fails if file status is not an object', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/file`,
        payload: {
          uploadStatus: 'ready',
          metadata: {
            retrievalKey: 'test'
          },
          form: {
            file: "this-shouldn't-be-a-string"
          },
          numberOfRejectedFiles: 1
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion failed'
      })
    })

    test('Testing POST /file route fails if file status is not present', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/file`,
        payload: {
          uploadStatus: 'ready',
          metadata: {},
          form: {
            file: successfulFile
          },
          numberOfRejectedFiles: 1
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion failed'
      })
    })

    test('Testing POST /file/link route returns Forbidden if auth missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        payload: {
          fileId: '1234',
          retrievalKey: 'test'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
    })

    test('Testing POST /file/link route returns bad request if retrieval key missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        auth,
        payload: {
          fileId: '1234'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"retrievalKey" is required'
      })
    })

    test('Testing POST /files/persist route returns bad request if initiatedRetrievalKey is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/files/persist',
        auth,
        payload: {
          files: [
            {
              fileId: '1234'
            }
          ],
          persistedRetrievalKey: '1234'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"files[0].initiatedRetrievalKey" is required'
      })
    })

    test('Testing POST /files/persist route returns bad request if persistedRetrievalKey is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/files/persist',
        auth,
        payload: {
          files: [
            {
              fileId: '1234',
              initiatedRetrievalKey: '1234'
            }
          ]
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"persistedRetrievalKey" is required'
      })
    })

    test('Testing POST /file/link route returns bad request if file ID is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        auth,
        payload: {
          retrievalKey: '1234'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"fileId" is required'
      })
    })

    test('Testing POST /files/persist route returns bad request if file ID is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/files/persist',
        auth,
        payload: {
          files: [
            {
              initiatedRetrievalKey: '1234'
            }
          ],
          persistedRetrievalKey: '1234'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"files[0].fileId" is required'
      })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 * @import { FileUploadStatus } from '~/src/api/types.js'
 */
