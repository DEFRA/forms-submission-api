import { validateAppAuth, validateAuth } from '~/src/plugins/auth/index.js'

describe('Auth plugin', () => {
  describe('Validate azure JWT', () => {
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
            aud: '2b7b41bf-7f92-4aeb-9b05-7e8a30f86ec2',
            iss: 'https://login.microsoftonline.com/bdd7c0af-1c2c-4158-b743-55e21ad02a9e/v2.0',
            iat: 1765443559,
            nbf: 1765443559,
            exp: 1765448056,
            aio: 'AYQAe',
            azp: '2b7b41bf-7f92-4aeb-9b05-7e8a30f86ec2',
            azpacr: '1',
            family_name: 'Chase',
            given_name: 'Enrique',
            groups: ['7049296f-2156-4d61-8ac3-349276438ef9'],
            login_hint: 'O.CiQ',
            name: 'Enrique Chase (Defra)',
            oid: '396e84b4-1cbd-40d0-af83-857be2aaefa7',
            preferred_username: 'Enrique.Chase@defradev.onmicrosoft.com',
            rh: '1.AToAE.',
            scp: 'forms.user',
            sid: 'ec5ab3a9-5b3d-4b0c-8c76-5f84670d60dd',
            sub: 'hjtL_2p2Me5JkBB6JeB20PyU3YDuP9PjEZwi7m1QHmg',
            tid: 'bdd7c0af-1c2c-4158-b743-55e21ad02a9e',
            uti: 'h6bvE-aex0a2KlkyjpYaAA',
            ver: '2.0',
            xms_ftd: 'Dva91E',
            ...partialpayload
          },
          signature: 'pNNvCHFI7uz0Sj'
        }
      }
    }

    test('Testing validateAuth with a valid artifact returns isValid: true', () => {
      const artifacts = buildArtifactStub()
      const res = validateAuth(artifacts)

      expect(res).toEqual({
        isValid: true,
        credentials: { user: artifacts.decoded.payload }
      })
    })

    test('Testing validateAuth with an invalid payload in the artifact returns isValid: false', () => {
      const artifacts = buildArtifactStub({ client_id: 'invalid' })

      // @ts-expect-error - test stub
      artifacts.decoded.payload = undefined

      const res = validateAuth(artifacts)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAuth with an invalid oid in the artifact returns isValid: false', () => {
      const artifacts = buildArtifactStub({ oid: undefined })
      const res = validateAuth(artifacts)

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

    const buildRequestStub = function (payload = {}) {
      return /** @type {import('@hapi/hapi').Request} */ ({
        payload
      })
    }

    test('Testing validateAppAuth with a valid artifact returns isValid: true', () => {
      const artifacts = buildArtifactStub()
      const request = buildRequestStub({ retrievalKey: 'test-key-1' })
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: true,
        credentials: { app: artifacts.decoded.payload }
      })
    })

    test('Testing validateAppAuth with an invalid client_id in the artifact returns isValid: false', () => {
      const artifacts = buildArtifactStub({ client_id: 'invalid' })
      const request = buildRequestStub()
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAppAuth with an invalid token_use in the artifact returns isValid: false', () => {
      const artifacts = buildArtifactStub({ token_use: 'not_access' })
      const request = buildRequestStub()
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAppAuth with a valid retrievalKey returns isValid: true', () => {
      const artifacts = buildArtifactStub()
      const request = buildRequestStub({ retrievalKey: 'test-key-1' })
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: true,
        credentials: { app: artifacts.decoded.payload }
      })
    })

    test('Testing validateAppAuth with an invalid retrievalKey returns isValid: false', () => {
      const artifacts = buildArtifactStub()
      const request = buildRequestStub({ retrievalKey: 'invalid-key' })
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAppAuth without retrievalKey in payload returns isValid: false', () => {
      const artifacts = buildArtifactStub()
      const request = buildRequestStub({ someOtherField: 'value' })
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAppAuth with missing payload returns isValid: false', () => {
      const artifacts = buildArtifactStub()
      const request = buildRequestStub()
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: false
      })
    })

    test('Testing validateAppAuth with non-string retrievalKey returns isValid: false', () => {
      const artifacts = buildArtifactStub()
      const request = buildRequestStub({ retrievalKey: 12345 })
      const res = validateAppAuth(artifacts, request)

      expect(res).toEqual({
        isValid: false
      })
    })
  })
})
