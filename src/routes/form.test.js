import { FormStatus, SecurityQuestionsEnum } from '@defra/forms-model'
import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import { submit } from '~/src/services/file-service.js'
import {
  validateAndGetSavedState,
  validateSavedLink
} from '~/src/services/save-and-exit-service.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/services/file-service.js')
jest.mock('~/src/services/save-and-exit-service.js')
jest.mock('~/src/tasks/receive-messages.js')

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

      /**
       * @type {UUID}
       */
      const GUID_EMPTY = '00000000-0000-0000-0000-000000000000'
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
      jest.mocked(validateSavedLink).mockResolvedValueOnce({
        form: {
          id: '12345',
          slug: 'my-first-form',
          title: 'My First Form',
          isPreview: false,
          status: FormStatus.Draft
        },
        question: SecurityQuestionsEnum.MemorablePlace
      })
      const response = await server.inject({
        method: 'GET',
        url: '/save-and-exit/abcdefg'
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        form: {
          id: '12345',
          slug: 'my-first-form',
          title: 'My First Form',
          isPreview: false,
          status: 'draft'
        },
        question: 'memorable-place'
      })
    })

    test('Testing POST /save-and-exit route fails if with invalid payload', async () => {
      // @ts-expect-error - invalid type due to invalid payload
      jest.mocked(validateAndGetSavedState).mockResolvedValue({})
      const response = await server.inject({
        method: 'POST',
        url: '/save-and-exit',
        payload: {
          something: 'that is not valid'
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
      expect(response.result).toMatchObject({
        error: 'Bad Request',
        message:
          '"email" is required. "state" is required. "something" is not allowed'
      })
    })

    test('Testing POST /save-and-exit route is successful with valid payload', async () => {
      jest.mocked(validateAndGetSavedState).mockResolvedValue({
        form: {
          id: '12345',
          slug: 'my-first-form',
          title: 'My First Form',
          isPreview: false,
          status: FormStatus.Draft
        },
        state: {
          formField1: '123'
        }
      })
      const response = await server.inject({
        method: 'POST',
        url: '/save-and-exit',
        payload: {
          form: {
            id: '12345',
            title: 'My First Form',
            slug: 'my-first-form',
            status: FormStatus.Draft,
            isPreview: false
          },
          security: {
            question: SecurityQuestionsEnum.MemorablePlace,
            answer: 'answer'
          },
          email: 'my-email@test.com',
          state: {}
        }
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
      expect(response.result).toMatchObject({
        message: 'Save-and-exit retrieved successfully',
        result: {
          state: {
            formField1: '123'
          },
          form: {
            id: '12345'
          }
        }
      })
    })
  })
})

/**
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { Server } from '@hapi/hapi'
 * @import { UUID } from 'crypto'
 */
