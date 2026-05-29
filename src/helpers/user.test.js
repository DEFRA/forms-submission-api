import { getUserEmail } from '~/src/helpers/user.js'
import { authAdmin } from '~/test/fixtures/auth.js'

describe('user-helper', () => {
  test('returns email if preferred_username is missing', () => {
    expect(
      getUserEmail(
        /** @type {RequestAuth<UserCredentials>} */ (
          /** @type {unknown} */ (authAdmin)
        )
      )
    ).toBe('enrique.chase@defra.gov.uk')
  })

  test('throw if preferred_username is missing', () => {
    const err = new Error('User email not found')
    const authWithoutEmail = /** @type {RequestAuth<UserCredentials>} */ (
      /** @type {unknown} */ ({
        ...authAdmin,
        credentials: {
          ...authAdmin.credentials,
          user: {
            ...authAdmin.credentials.user,
            preferred_username: undefined // set preferred_username to test error handling
          }
        }
      })
    )
    expect(() => getUserEmail(authWithoutEmail)).toThrow(err)
  })
})

/**
 * @import { RequestAuth, UserCredentials, AppCredentials } from '@hapi/hapi'
 */
