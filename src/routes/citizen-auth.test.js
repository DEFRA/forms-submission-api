import { generateKeyPairSync } from 'node:crypto'

import Jwt from '@hapi/jwt'
import { StatusCodes } from 'http-status-codes'

import { createServer } from '~/src/api/server.js'
import { getSaveAndExitRecordsForUser } from '~/src/services/save-and-exit-service.js'

jest.mock('~/src/mongo.js')
jest.mock('~/src/services/save-and-exit-service.js')
jest.mock('~/src/tasks/receive-save-and-exit-messages.js')
jest.mock('~/src/tasks/receive-submission-messages.js')
jest.mock('~/src/services/submission-service.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}))

// Matches the CITIZEN_* settings and the published key in jest.setup.js
const ISSUER = 'dummy'
const AUDIENCE = 'urn:defra:forms:forms-submission-api'
const SUB = 'a3f1c0de-0000-4000-8000-000000000001'

const { privateKeyPem, kid } = globalThis.citizenSigningKey

/**
 * Signs a token the way the identity provider does.
 * @param {Record<string, unknown>} [claims]
 * @param {string} [key]
 */
function signAccessToken(claims = {}, key = privateKeyPem) {
  return Jwt.token.generate(
    {
      sub: SUB,
      iss: ISSUER,
      aud: AUDIENCE,
      client_id: 'runner',
      ...claims
    },
    { key, algorithm: 'RS256' },
    { header: { kid } }
  )
}

describe('Citizen access token', () => {
  /** @type {any} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => server.stop())

  /**
   * @param {string} token
   */
  function callWith(token) {
    return server.inject({
      method: 'GET',
      url: '/save-and-exit/records',
      headers: { authorization: `Bearer ${token}` }
    })
  }

  test('should accept a token the identity provider signed and name the citizen from it', async () => {
    jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValueOnce([])

    const response = await callWith(signAccessToken())

    expect(response.statusCode).toEqual(StatusCodes.OK)
    expect(getSaveAndExitRecordsForUser).toHaveBeenCalledWith(
      SUB,
      ISSUER,
      undefined
    )
  })

  test('should refuse a token minted for another resource server', async () => {
    const response = await callWith(
      signAccessToken({ aud: 'urn:defra:forms:someone-else' })
    )

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should refuse a token from another issuer', async () => {
    const response = await callWith(
      signAccessToken({ iss: 'https://impostor.example' })
    )

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should refuse a token signed by a key the provider does not publish', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const forged = signAccessToken(
      {},
      /** @type {string} */ (
        privateKey.export({ type: 'pkcs8', format: 'pem' })
      )
    )

    const response = await callWith(forged)

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should refuse an expired token', async () => {
    const response = await callWith(
      signAccessToken({ exp: Math.floor(Date.now() / 1000) - 60 })
    )

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })
})
