import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import { STUB_SUBMISSION_REF } from '~/src/repositories/__stubs__/submission.js'
import { getSubmissionRecordByReference } from '~/src/repositories/submission-repository.js'
import { authAdmin } from '~/test/fixtures/auth.js'
// @ts-expect-error - import json
import formSubmissions from '~/test/fixtures/forms-submissions.json'

jest.mock('~/src/mongo.js')
jest.mock('~/src/repositories/submission-repository.js')

describe('Submission routes', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  describe('Get submission record', () => {
    test('Testing GET /submission/{referenceNumber} route is successful with valid params', async () => {
      const expectedRecord = formSubmissions.at(0)
      jest
        .mocked(getSubmissionRecordByReference)
        // @ts-expect-error - test data is not fully compliant with FormSubmissionDocument type
        .mockResolvedValue(expectedRecord)

      const response = await server.inject({
        method: 'GET',
        url: `/submission/${STUB_SUBMISSION_REF}`,
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.OK)
    })

    test('Testing GET /submission/{referenceNumber} returns 404 when record not found', async () => {
      jest.mocked(getSubmissionRecordByReference).mockResolvedValue(null)

      const response = await server.inject({
        method: 'GET',
        url: `/submission/${STUB_SUBMISSION_REF}`,
        auth: authAdmin
      })

      expect(response.statusCode).toEqual(StatusCodes.NOT_FOUND)
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
