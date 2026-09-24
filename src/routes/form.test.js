import { FormStatus, SecurityQuestionsEnum } from '@defra/forms-model'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import { submit } from '~/src/services/file-service.js'
import { generateReportTimeline } from '~/src/services/report.js'
import {
  deleteSavedLinkDetails,
  getSaveAndExitRecordForUser,
  getSaveAndExitRecordsForUser,
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'
import { authCitizen } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/services/file-service.js')
jest.mock('~/src/services/save-and-exit-service.js')
jest.mock('~/src/tasks/receive-save-and-exit-messages.js')
jest.mock('~/src/tasks/receive-submission-messages.js')
jest.mock('~/src/services/submission-service.js')
jest.mock('~/src/services/report.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}))

describe('Forms route', () => {
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

  describe('Success responses', () => {
    test('Testing POST /submit route returns file ids', async () => {
      /** @type {SubmitPayload} */
      const payload = {
        retrievalKey: 'enrique.chase@defra.gov.uk',
        sessionId: '2e46661c-e9b5-43aa-84bb-c6a4e5b88814',
        main: [
          {
            name: 'FFhvH',
            title: 'Do you have any food allergies?',
            value: 'Peanuts'
          },
          {
            name: 'XIPMNK',
            title: 'Telephone number field',
            value: '07836 148379'
          },
          {
            name: 'AdGTh',
            title: 'Optional field',
            value: ''
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
                  value: '21'
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
          }
        ]
      }

      const submitResponse = {
        main: GUID_EMPTY,
        repeaters: {
          w3E5gf: GUID_EMPTY
        }
      }

      jest.mocked(submit).mockResolvedValueOnce(submitResponse)

      const response = await server.inject({
        method: 'POST',
        url: '/submit',
        payload
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Submit completed',
        result: { files: submitResponse }
      })
    })
  })

  describe('Error responses', () => {
    test('Testing POST /submit route fails if with invalid payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/submit',
        payload: {
          something: 'that is not valid'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"retrievalKey" is required. "sessionId" is required. "main" is required. "repeaters" is required. "something" is not allowed'
      })
    })
  })

  describe('Save and exit', () => {
    test('Testing GET /save-and-exit route returns record', async () => {
      jest.mocked(getSavedLinkDetails).mockResolvedValueOnce({
        form: {
          id: '12345',
          isPreview: false,
          status: FormStatus.Draft,
          baseUrl: 'http://localhost:3009'
        },
        authType: 'memorableWord',
        question: SecurityQuestionsEnum.MemorablePlace,
        invalidPasswordAttempts: 0
      })
      const response = await server.inject({
        method: 'GET',
        url: `/save-and-exit/${GUID_EMPTY}`
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        form: {
          id: '12345',
          isPreview: false,
          status: 'draft'
        },
        authType: 'memorableWord',
        question: 'memorable-place'
      })
    })

    test('Testing GET /save-and-exit route returns account-linked record without a question', async () => {
      jest.mocked(getSavedLinkDetails).mockResolvedValueOnce({
        form: {
          id: '12345',
          isPreview: false,
          status: FormStatus.Draft,
          baseUrl: 'http://localhost:3009'
        },
        authType: 'citizenSignIn'
      })
      const response = await server.inject({
        method: 'GET',
        url: `/save-and-exit/${GUID_EMPTY}`
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        form: {
          id: '12345',
          isPreview: false,
          status: 'draft'
        },
        authType: 'citizenSignIn'
      })
      expect(response.result).not.toHaveProperty('question')
    })

    test('Testing GET /save-and-exit route returns record with latest id when current one is consumed', async () => {
      jest.mocked(getSavedLinkDetails).mockImplementationOnce(() => {
        const boomError = Boom.resourceGone('consumed magic link')
        boomError.output.payload = {
          ...boomError.output.payload,
          latestId: 'latest-link-id'
        }
        throw boomError
      })
      const response = await server.inject({
        method: 'GET',
        url: `/save-and-exit/${GUID_EMPTY}`
      })

      expect(response.statusCode).toEqual(StatusCodes.GONE)
      expect(response.result).toMatchObject({
        latestId: 'latest-link-id'
      })
    })

    test('Testing POST /save-and-exit route fails if with invalid payload', async () => {
      // @ts-expect-error - invalid type due to invalid payload
      jest.mocked(validateSavedLinkCredentials).mockResolvedValue({})
      const response = await server.inject({
        method: 'POST',
        url: `/save-and-exit/${GUID_EMPTY}`,
        payload: {
          something: 'that is not valid'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message: '"securityAnswer" is required. "something" is not allowed'
      })
    })

    test('Testing POST /save-and-exit route is successful with valid payload', async () => {
      jest.mocked(validateSavedLinkCredentials).mockResolvedValue({
        form: {
          id: '12345',
          isPreview: false,
          status: FormStatus.Draft,
          baseUrl: 'http://localhost:3009'
        },
        state: {
          formField1: '123'
        },
        invalidPasswordAttempts: 0,
        question: SecurityQuestionsEnum.MemorablePlace,
        validPassword: true,
        magicLinkGroupId: 'group-id'
      })
      const response = await server.inject({
        method: 'POST',
        url: `/save-and-exit/${GUID_EMPTY}`,
        payload: {
          securityAnswer: 'answer'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        validPassword: true,
        state: {
          formField1: '123'
        },
        form: {
          id: '12345'
        },
        invalidPasswordAttempts: 0
      })
    })
  })

  describe('report', () => {
    test('Testing GET /report/timeline route returns data', async () => {
      jest.mocked(generateReportTimeline).mockResolvedValueOnce({
        timeline: []
      })
      const response = await server.inject({
        method: 'GET',
        url: '/report/timeline?date=2025-05-04'
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        timeline: []
      })
    })
  })

  describe('Save and exit records', () => {
    const record = {
      magicLinkId: '3b3ba0e1-45cf-4b2b-9a3a-8f0f9a1c33aa',
      referenceNumber: '123-456-789',
      formTitle: 'My FirstForm',
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      expireAt: new Date('2026-09-29T09:00:00.000Z')
    }

    test('Testing GET /save-and-exit/records returns the records of the signed-in citizen', async () => {
      jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValueOnce([record])

      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/records?formId=688131eeff67f889d52c66cc',
        auth: authCitizen
      })

      expect(getSaveAndExitRecordsForUser).toHaveBeenCalledWith(
        authCitizen.credentials.user.sub,
        authCitizen.credentials.user.iss,
        '688131eeff67f889d52c66cc',
        undefined
      )
      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toEqual([
        { ...record, createdAt: record.createdAt, expireAt: record.expireAt }
      ])
    })

    test('Testing GET /save-and-exit/records passes the preview state', async () => {
      jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValueOnce([])

      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/records?formId=688131eeff67f889d52c66cc&preview=draft',
        auth: authCitizen
      })

      expect(getSaveAndExitRecordsForUser).toHaveBeenCalledWith(
        authCitizen.credentials.user.sub,
        authCitizen.credentials.user.iss,
        '688131eeff67f889d52c66cc',
        FormStatus.Draft
      )
      expect(response.statusCode).toEqual(StatusCodes.OK)
    })

    test('Testing GET /save-and-exit/records refuses an unknown preview state', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/records?formId=688131eeff67f889d52c66cc&preview=other',
        auth: authCitizen
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
    })

    test('Testing GET /save-and-exit/records refuses a request without a form id', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/records',
        auth: authCitizen
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message: '"formId" is required'
      })
    })

    test('Testing GET /save-and-exit/records is not reachable without a citizen token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/records?formId=688131eeff67f889d52c66cc'
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
      expect(response.result).toMatchObject({
        statusCode: StatusCodes.UNAUTHORIZED,
        error: 'Unauthorized'
      })
    })

    const LINK = '3b3ba0e1-45cf-4b2b-9a3a-8f0f9a1c33aa'

    test('Testing GET /save-and-exit/records/{link} returns the saved state of the owner', async () => {
      jest.mocked(getSaveAndExitRecordForUser).mockResolvedValueOnce({
        state: { formField1: 'val1' },
        magicLinkGroupId: 'group-1'
      })

      const response = await server.inject({
        method: 'GET',
        url: `/save-and-exit/records/${LINK}`,
        auth: authCitizen
      })

      expect(getSaveAndExitRecordForUser).toHaveBeenCalledWith(
        authCitizen.credentials.user.sub,
        authCitizen.credentials.user.iss,
        LINK
      )
      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toEqual({
        state: { formField1: 'val1' },
        magicLinkGroupId: 'group-1'
      })
    })

    test('Testing GET /save-and-exit/records/{link} hides a record of another citizen', async () => {
      jest
        .mocked(getSaveAndExitRecordForUser)
        .mockRejectedValueOnce(Boom.notFound('Invalid magic link'))

      const response = await server.inject({
        method: 'GET',
        url: `/save-and-exit/records/${LINK}`,
        auth: authCitizen
      })

      expect(response.statusCode).toEqual(StatusCodes.NOT_FOUND)
    })

    test('Testing GET /save-and-exit/records/{link} is not reachable without a citizen token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/save-and-exit/records/${LINK}`
      })

      expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
    })

    test('Testing GET /save-and-exit/records/{link} refuses a link that is not a uuid', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/records/not-a-uuid',
        auth: authCitizen
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
    })

    test('Testing DELETE /save-and-exit/records/{link} returns the saved state of the owner', async () => {
      jest.mocked(deleteSavedLinkDetails).mockResolvedValueOnce({
        matched: true,
        modified: true
      })

      const response = await server.inject({
        method: 'DELETE',
        url: `/save-and-exit/records/${LINK}`,
        auth: authCitizen
      })

      expect(deleteSavedLinkDetails).toHaveBeenCalledWith(
        LINK,
        authCitizen.credentials.user.sub
      )
      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toEqual({
        matched: true,
        modified: true
      })
    })
  })
})

/**
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { Server } from '@hapi/hapi'
 * @import { UUID } from 'crypto'
 */
