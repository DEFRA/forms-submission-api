import { FormStatus, SecurityQuestionsEnum } from '@defra/forms-model'
import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import { submit } from '~/src/services/file-service.js'
import {
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'
import { generateSubmissionsFile } from '~/src/services/submission-service.js'
import { auth } from '~/test/fixtures/auth.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/services/file-service.js')
jest.mock('~/src/services/save-and-exit-service.js')
jest.mock('~/src/tasks/receive-save-and-exit-messages.js')
jest.mock('~/src/tasks/receive-submission-messages.js')
jest.mock('~/src/services/submission-service.js')

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
        question: 'memorable-place'
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
        validPassword: true
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

  describe('Generate submissions file', () => {
    test('Testing POST /submissions/{formId} route is successful with valid params', async () => {
      jest.mocked(generateSubmissionsFile).mockResolvedValue({
        fileId: 'b93a5f08-e044-46f6-baec-0e5a5d8eaa53'
      })

      const response = await server.inject({
        method: 'POST',
        url: '/submissions/688131eeff67f889d52c66cc',
        auth
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Generate form submissions file success'
      })
    })

    test('Testing POST /submissions/{formId} route fails if with invalid params', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/submissions/invalid-form-id',
        auth
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
})

/**
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { Server } from '@hapi/hapi'
 * @import { UUID } from 'crypto'
 */
