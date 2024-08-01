import { StatusCodes } from 'http-status-codes'

import { ingestFile, getPresignedLink } from '../api/files/service.js'

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

    test('Testing POST /file-link route returns an S3 link', async () => {
      jest
        .mocked(getPresignedLink)
        .mockResolvedValue('https://s3.dummy.com/file.txt')

      const response = await server.inject({
        method: 'POST',
        url: '/file-link',
        auth,
        payload: {
          fileId: '1234',
          retrievalKey: 'test'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.result).toMatchObject({
        url: expect.any(String)
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

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"form.file.fileStatus" must be [complete]'
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

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"form.file" must be of type object'
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

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"metadata.retrievalKey" is required'
      })
    })

    test('Testing POST /file-link route returns Forbidden if auth missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file-link',
        payload: {
          fileId: '1234',
          retrievalKey: 'test'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
    })

    test('Testing POST /file-link route returns bad request if retrieval key missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file-link',
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

    test('Testing POST /file-link route returns bad request if file ID is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file-link',
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
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 * @import { FileUploadStatus, UploadPayload } from '~/src/api/types.js'
 */
