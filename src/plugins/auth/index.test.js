import { buildArtifactStub } from '~/src/plugins/auth/auth-stub.js'
import {
  validateAppAuth,
  validateAuth,
  validateRetrievalKey
} from '~/src/plugins/auth/index.js'
import { getUserScopes } from '~/src/services/entitlements-service.js'

jest.mock('~/src/services/entitlements-service.js')

describe('Auth plugin', () => {
  describe('Validate azure JWT', () => {
    test('Testing validateAuth with a valid artifact returns isValid: true', async () => {
      jest
        .mocked(getUserScopes)
        .mockResolvedValueOnce(['form-delete', 'form-edit', 'form-read'])

      const artifacts = buildArtifactStub()
      const res = await validateAuth(artifacts)

      expect(getUserScopes).toHaveBeenCalledWith(
        artifacts.decoded.payload.oid,
        artifacts.token
      )
      expect(res).toEqual({
        isValid: true,
        credentials: {
          user: artifacts.decoded.payload,
          scope: ['form-delete', 'form-edit', 'form-read']
        }
      })
    })

    test('Testing validateAuth with an invalid payload in the artifact returns isValid: false', async () => {
      const artifacts = buildArtifactStub({ client_id: 'invalid' })

      // @ts-expect-error - test stub
      artifacts.decoded.payload = undefined

      const res = await validateAuth(artifacts)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAuth with an invalid oid in the artifact returns isValid: false', async () => {
      const artifacts = buildArtifactStub({ oid: undefined })
      const res = await validateAuth(artifacts)

      expect(res).toEqual({
        isValid: false
      })
    })
  })

  describe('Validate cognito JWT', () => {
    const buildArtifactStub = function (partialpayload = {}) {
      return {
        token: 'eyJrjwt...',
        raw: {
          header: 'eyJraW',
          payload: 'eyJzdWIi',
          signature: 'pNNv...'
        },
        decoded: {
          header: {
            alg: 'RS256',
            kid: 'amhKOdpPMacPs5='
          },
          payload: {
            sub: '120584e4-f0f1-70b3-62b6-2690826bb170',
            iss: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_ojQ9Fj7FA',
            version: 2,
            client_id: 'dummy',
            origin_jti: '5169b120-404a-4c91-9651-94def6a03adc',
            event_id: 'b72a43e7-ebe7-45ec-9eca-91ee88d3480e',
            token_use: 'access',
            scope: 'openid email',
            auth_time: 1765381525,
            exp: 1765385125,
            iat: 1765381526,
            jti: '4592ec9a-a4fa-47e7-8a65-eb130c5a2b60',
            username: '120584e4-f0f1-70b3-62b6-2690826bb170',
            ...partialpayload
          },
          signature: 'pNNvCHFI7uz0Sj'
        }
      }
    }

    test('Testing validateAppAuth with a valid artifact returns isValid: true', () => {
      const artifacts = buildArtifactStub()
      const res = validateAppAuth(artifacts)

      expect(res).toEqual({
        isValid: true,
        credentials: { app: artifacts.decoded.payload }
      })
    })

    test('Testing validateAppAuth with an invalid client_id in the artifact returns isValid: false', () => {
      const artifacts = buildArtifactStub({ client_id: 'invalid' })
      const res = validateAppAuth(artifacts)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAppAuth with an invalid token_use in the artifact returns isValid: false', () => {
      const artifacts = buildArtifactStub({ token_use: 'not_access' })
      const res = validateAppAuth(artifacts)

      expect(res).toEqual({
        isValid: false
      })
    })
  })

  describe('Validate retrievalKey authorization', () => {
    test('Testing validateRetrievalKey with valid retrievalKey does not throw', () => {
      expect(() => {
        validateRetrievalKey('dummy', 'test-key-1')
      }).not.toThrow()
    })

    test('Testing validateRetrievalKey with another valid retrievalKey does not throw', () => {
      expect(() => {
        validateRetrievalKey('dummy', 'test-key-2')
      }).not.toThrow()
    })

    test('Testing validateRetrievalKey throws 403 when retrievalKey is not permitted for client', () => {
      expect(() => {
        validateRetrievalKey('dummy', 'invalid-key')
      }).toThrow('retrievalKey not permitted for client')
    })

    test('Testing validateRetrievalKey throws 403 when client ID does not exist', () => {
      expect(() => {
        validateRetrievalKey('unknown-client', 'test-key-1')
      }).toThrow('retrievalKey not permitted for client')
    })
  })
})
