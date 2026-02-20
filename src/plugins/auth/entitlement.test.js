import { buildArtifactStub } from '~/src/plugins/auth/auth-stub.js'
import { validateAuth } from '~/src/plugins/auth/index.js'
import { getUserScopes } from '~/src/services/entitlements-service.js'

jest.mock('~/src/config/index.js', () => ({
  config: {
    get: jest.fn((key) => {
      const originalConfig = jest.requireActual('~/src/config/index.js')

      if (key === 'useEntitlementApi') return true
      return originalConfig.config.get(key)
    })
  }
}))

jest.mock('~/src/services/entitlements-service.js')

describe('Auth plugin with entitlements', () => {
  describe('Validate azure JWT', () => {
    test('Testing validateAuth with a valid artifact returns isValid: true', async () => {
      jest
        .mocked(getUserScopes)
        .mockResolvedValueOnce(['form-delete', 'form-edit', 'form-read'])

      const artifacts = buildArtifactStub()
      const res = await validateAuth(artifacts)

      expect(res).toEqual({
        isValid: true,
        credentials: {
          user: artifacts.decoded.payload,
          scope: ['form-delete', 'form-edit', 'form-read']
        }
      })
    })
  })
})
