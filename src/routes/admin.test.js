import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import {
  receiveDlqMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'
import { resetSaveAndExitLink } from '~/src/services/save-and-exit-service.js'
import {
  generateFeedbackSubmissionsFileForAll,
  generateFeedbackSubmissionsFileForForm,
  generateFormSubmissionsFile,
  generateSubmissionsFile
} from '~/src/services/submission-service.js'
import { authAdmin, authSuperadmin } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/services/file-service.js')
jest.mock('~/src/services/save-and-exit-service.js')
jest.mock('~/src/tasks/receive-save-and-exit-messages.js')
jest.mock('~/src/tasks/receive-submission-messages.js')
jest.mock('~/src/services/submission-service.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  })
}))
jest.mock('~/src/messaging/event.js')

const okStatusCode = 200
const jsonContentType = 'application/json'

describe('Admin route', () => {
  /** @type {Server} */
  let server

  /**
   * @type {UUID}
   */
  const GUID_EMPTY = '00000000-0000-0000-0000-000000000000'

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  describe('Reset save and exit', () => {
    test('Testing POST /save-and-exit/reset route returns reset details', async () => {
      jest.mocked(resetSaveAndExitLink).mockResolvedValueOnce({
        recordFound: true,
        recordUpdated: true
      })
      const response = await server.inject({
        method: 'POST',
        url: `/save-and-exit/reset/${GUID_EMPTY}`,
        auth: authSuperadmin
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        recordFound: true,
        recordUpdated: true
      })
    })

    test('Testing POST /save-and-exit/reset route fails if with invalid params', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/save-and-exit/reset/00-11-22`,
        auth: authSuperadmin
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"link" must be a valid GUID'
      })
    })

    test('Testing POST /save-and-exit/reset route fails without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/save-and-exit/reset/${GUID_EMPTY}`
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
      expect(response.result).toMatchObject({
        error: 'Unauthorized',
        message: 'Missing authentication',
        statusCode: 401
      })
    })
  })

  describe('Generate form submissions file', () => {
    test('Testing POST /submissions/{formId} route is successful with valid params', async () => {
      jest.mocked(generateSubmissionsFile).mockResolvedValue({
        fileId: 'b93a5f08-e044-46f6-baec-0e5a5d8eaa53'
      })

      const response = await server.inject({
        method: 'POST',
        url: '/submissions/688131eeff67f889d52c66cc',
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Generate form submissions file success'
      })
      expect(generateFormSubmissionsFile).toHaveBeenCalledWith(
        '688131eeff67f889d52c66cc'
      )
    })

    test('Testing POST /submissions/{formId} route fails if with invalid params', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/submissions/invalid-form-id',
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"formId" must only contain hexadecimal characters. "formId" length must be 24 characters long'
      })
    })

    test('Testing POST /submissions/{formId} route fails if without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/submissions/688131eeff67f889d52c66cc'
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('Generate feedback submissions file', () => {
    test('Testing POST /feedback/{formId} route is successful with valid params', async () => {
      jest.mocked(generateSubmissionsFile).mockResolvedValue({
        fileId: 'b93a5f08-e044-46f6-baec-0e5a5d8eaa53'
      })

      const response = await server.inject({
        method: 'POST',
        url: '/feedback/688131eeff67f889d52c66cc',
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Generate feedback submissions file success'
      })
      expect(generateFeedbackSubmissionsFileForForm).toHaveBeenCalledWith(
        '688131eeff67f889d52c66cc'
      )
    })

    test('Testing POST /feedback/{formId} route is successful with optional missing params', async () => {
      jest.mocked(generateSubmissionsFile).mockResolvedValue({
        fileId: 'b93a5f08-e044-46f6-baec-0e5a5d8eaa53'
      })

      const response = await server.inject({
        method: 'POST',
        url: '/feedback',
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Generate feedback submissions file success'
      })
      expect(generateFeedbackSubmissionsFileForAll).toHaveBeenCalled()
    })

    test('Testing POST /feedback/{formId} route fails if with invalid params', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/feedback/invalid-form-id',
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"formId" must only contain hexadecimal characters. "formId" length must be 24 characters long'
      })
    })

    test('Testing POST /feedback/{formId} route fails if without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/feedback/688131eeff67f889d52c66cc'
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
    })

    test('Testing POST /feedback/{formId} route fails if user missing and optional missing param', async () => {
      const badAuth = structuredClone(authAdmin)
      // @ts-expect-error - forceably construct bad user object
      badAuth.credentials.user = undefined
      const response = await server.inject({
        method: 'POST',
        url: '/feedback',
        auth: badAuth
      })

      expect(response.statusCode).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  describe('Dead letter queues', () => {
    test('GET /admin/dead-letter/save-and-exit/view route returns 200', async () => {
      jest
        .mocked(receiveDlqMessages)
        .mockResolvedValue({ Messages: [{ MessageId: 'message1' }] })

      const response = await server.inject({
        method: 'GET',
        url: '/admin/deadletter/save-and-exit/view',
        auth: authSuperadmin
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ messages: [{ MessageId: 'message1' }] })
    })

    test('POST /admin/dead-letter/save-and-exit/redrive route returns 200', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/admin/deadletter/save-and-exit/redrive',
        auth: authSuperadmin
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
      expect(redriveDlqMessages).toHaveBeenCalled()
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 * @import { UUID } from 'crypto'
 */
