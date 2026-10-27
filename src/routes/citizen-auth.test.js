import { createPublicKey, generateKeyPairSync } from 'node:crypto'

import Jwt from '@hapi/jwt'
import { StatusCodes } from 'http-status-codes'
import nock from 'nock'

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

const privateKeyPem = /** @type {string} */ (
  process.env.CITIZEN_SIGNING_PRIVATE_KEY
)
const kid = process.env.CITIZEN_SIGNING_KEY_ID

/**
 * Creates an access token, signed the way the identity provider signs it.
 * @param {Record<string, unknown>} [claims]
 * @param {string} [key]
 * @param {string} [keyId]
 */
function createAccessToken(claims = {}, key = privateKeyPem, keyId = kid) {
  return Jwt.token.generate(
    {
      sub: SUB,
      iss: ISSUER,
      aud: AUDIENCE,
      client_id: 'runner',
      ...claims
    },
    { key, algorithm: 'RS256' },
    { header: { kid: keyId } }
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
      url: '/save-and-exit/records?formId=688131eeff67f889d52c66cc',
      headers: { authorization: `Bearer ${token}` }
    })
  }

  test('should accept a token the identity provider signed and name the citizen from it', async () => {
    jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValueOnce([])

    const response = await callWith(createAccessToken())

    expect(response.statusCode).toEqual(StatusCodes.OK)
    expect(getSaveAndExitRecordsForUser).toHaveBeenCalledWith(
      SUB,
      ISSUER,
      '688131eeff67f889d52c66cc',
      undefined
    )
  })

  test('should refuse a token minted for another resource server', async () => {
    const response = await callWith(
      createAccessToken({ aud: 'urn:defra:forms:someone-else' })
    )

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should refuse a token from another issuer', async () => {
    const response = await callWith(
      createAccessToken({ iss: 'https://impostor.example' })
    )

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should refuse a token signed by a key the provider does not publish', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const forged = createAccessToken(
      {},
      /** @type {string} */ (
        privateKey.export({ type: 'pkcs8', format: 'pem' })
      )
    )

    const response = await callWith(forged)

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should refuse a token signed by a key with an id the provider does not publish', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const forged = createAccessToken(
      {},
      /** @type {string} */ (
        privateKey.export({ type: 'pkcs8', format: 'pem' })
      ),
      'sig-rs256-unknown'
    )

    const response = await callWith(forged)

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })

  test('should accept a token signed by a key the provider published after the last fetch', async () => {
    jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValue([])

    // The key set is fetched before the rotation
    await callWith(createAccessToken())

    const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rotatedKid = 'sig-rs256-rotated'

    // The provider now publishes the new key next to the current key
    nock.cleanAll()
    nock('https://identity.test')
      .persist()
      .get('/.well_known/jwks.json')
      .reply(200, {
        keys: [
          {
            ...createPublicKey(privateKeyPem).export({ format: 'jwk' }),
            use: 'sig',
            alg: 'RS256',
            kid
          },
          {
            ...rotated.publicKey.export({ format: 'jwk' }),
            use: 'sig',
            alg: 'RS256',
            kid: rotatedKid
          }
        ]
      })

    // Moves past the cooldown between two fetches of the key set
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000)

    const response = await callWith(
      createAccessToken(
        {},
        /** @type {string} */ (
          rotated.privateKey.export({ type: 'pkcs8', format: 'pem' })
        ),
        rotatedKid
      )
    )

    expect(response.statusCode).toEqual(StatusCodes.OK)
  })

  test('should refuse an expired token', async () => {
    const response = await callWith(
      createAccessToken({ exp: Math.floor(Date.now() / 1000) - 60 })
    )

    expect(response.statusCode).toEqual(StatusCodes.UNAUTHORIZED)
  })
})
