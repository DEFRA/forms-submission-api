import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import filesRoutes from '~/src/routes/files.js'
import {
  checkFileStatus,
  getPresignedLink,
  ingestFile,
  persistFiles
} from '~/src/services/file-service.js'
import { appAuth, authAdmin } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/services/file-service.js')
jest.mock('~/src/tasks/receive-save-and-exit-messages.js')
jest.mock('~/src/tasks/receive-submission-messages.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}))

const persistRoute = filesRoutes.find(
  (route) => route.path === '/files/persist'
)

if (!persistRoute) {
  throw new Error('Expected /files/persist route to exist')
}

const persistRouteHandler =
  /** @type {(request: import('@hapi/hapi').Request<{ Payload: PersistedRetrievalPayload }>) => Promise<unknown>} */ (
    persistRoute.handler
  )

/**
 * Creates a typed request object for directly invoking the /files/persist handler.
 * @param {PersistedRetrievalPayload} payload
 */
function createPersistRouteRequest(payload) {
  const logger = {
    info: jest.fn(),
    warn: jest.fn()
  }

  return {
    logger,
    request:
      /** @type {import('@hapi/hapi').Request<{ Payload: PersistedRetrievalPayload }>} */ (
        /** @type {unknown} */ ({
          payload,
          logger
        })
      )
  }
}

describe('Files route', () => {
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
    fileId: '123456',
    filename: 'dummy.txt',
    hasError: false,
    fileStatus: 'complete'
  }

  describe('Success responses', () => {
    test('Testing POST /file route returns OK200 with a successful message', async () => {
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

    test('Testing POST /file route returns OK200 with multiple files in an array', async () => {
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
            file: [
              successfulFile,
              {
                ...successfulFile,
                fileId: '789012',
                filename: 'second.pdf'
              }
            ]
          },
          numberOfRejectedFiles: 0
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion completed'
      })
    })

    test('Testing POST /file route returns OK200 with a mix of complete and rejected files', async () => {
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
            file: [
              successfulFile,
              {
                fileId: '789012',
                filename: 'virus.exe',
                fileStatus: 'rejected',
                hasError: true,
                errorMessage: 'File contains a virus'
              }
            ]
          },
          numberOfRejectedFiles: 1
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion completed'
      })
    })

    test('Testing GET /file/{uploadId} route returns explicit retrievalKeyIsCaseSensitive value', async () => {
      jest.mocked(checkFileStatus).mockResolvedValue({
        retrievalKeyIsCaseSensitive: true,
        fileId: '12345',
        filename: 'test.txt',
        retrievalKey: 'test-key'
      })

      const response = await server.inject({
        method: 'GET',
        url: '/file/12345'
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Found',
        retrievalKeyIsCaseSensitive: true
      })
    })

    test('Testing GET /file/{uploadId} route defaults retrievalKeyIsCaseSensitive to true when undefined', async () => {
      jest.mocked(checkFileStatus).mockResolvedValue({
        fileId: '12345',
        filename: 'test.txt',
        retrievalKey: 'test-key'
      })

      const response = await server.inject({
        method: 'GET',
        url: '/file/12345'
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Found',
        retrievalKeyIsCaseSensitive: true
      })
    })

    test('Testing POST /file/link route with user auth returns an S3 link', async () => {
      jest
        .mocked(getPresignedLink)
        .mockResolvedValue('https://s3.dummy.com/file.txt')

      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        auth: authAdmin,
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

    test('Testing POST /file/link route with app auth returns an S3 link', async () => {
      jest
        .mocked(getPresignedLink)
        .mockResolvedValue('https://s3.dummy.com/file.txt')

      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        auth: appAuth,
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
        auth: authAdmin,
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
    test('Testing /files/persist handler logs failure details when persistFiles throws an Error', async () => {
      const error = new Error('Persist failed')
      const { logger, request } = createPersistRouteRequest({
        files: [
          {
            fileId: '1234',
            initiatedRetrievalKey: '1234'
          }
        ],
        persistedRetrievalKey: '5678'
      })

      jest.mocked(persistFiles).mockRejectedValueOnce(error)

      await expect(persistRouteHandler(request)).rejects.toThrow(error)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            message: 'Persist failed'
          },
          event: expect.objectContaining({
            action: 'files.persist.request',
            category: 'web',
            duration: expect.any(Number),
            outcome: 'failure',
            reason: 'Persist failed',
            reference: '/files/persist',
            type: 'end'
          }),
          log: {
            logger: 'files.persist.route'
          }
        }),
        '[filesPersistRoute:perf] Completed /files/persist request (fileCount=1 error=Persist failed)'
      )
    })

    test('Testing /files/persist handler logs Unknown error when persistFiles throws a non-Error value', async () => {
      const { logger, request } = createPersistRouteRequest({
        files: [
          {
            fileId: '1234',
            initiatedRetrievalKey: '1234'
          }
        ],
        persistedRetrievalKey: '5678'
      })

      jest.mocked(persistFiles).mockRejectedValueOnce('boom')

      await expect(persistRouteHandler(request)).rejects.toBe('boom')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            message: 'Unknown error'
          },
          event: expect.objectContaining({
            action: 'files.persist.request',
            category: 'web',
            duration: expect.any(Number),
            outcome: 'failure',
            reason: 'Unknown error',
            reference: '/files/persist',
            type: 'end'
          }),
          log: {
            logger: 'files.persist.route'
          }
        }),
        '[filesPersistRoute:perf] Completed /files/persist request (fileCount=1 error=Unknown error)'
      )
    })

    test('Testing POST /file route handles a rejected file gracefully', async () => {
      jest.mocked(ingestFile).mockResolvedValue()

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
              fileId: '123456',
              filename: 'bad-file.exe',
              hasError: true,
              errorMessage: 'File type not allowed',
              fileStatus: 'rejected'
            }
          },
          numberOfRejectedFiles: 1
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Ingestion completed'
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
        auth: authAdmin,
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
        auth: authAdmin,
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
        auth: authAdmin,
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
        auth: authAdmin,
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

    test('Testing POST /file/link route with Cognito auth returns Forbidden if retrievalKey not permitted for client', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/file/link',
        auth: appAuth,
        payload: {
          fileId: '1234',
          retrievalKey: 'not-permitted-key'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.FORBIDDEN)
      expect(response.result).toMatchObject({
        error: 'Forbidden',
        message: 'retrievalKey not permitted for client'
      })
    })

    test('Testing POST /files/persist route returns bad request if file ID is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/files/persist',
        auth: authAdmin,
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
 * @import { FileUploadStatus, PersistedRetrievalPayload } from '~/src/api/types.js'
 */
