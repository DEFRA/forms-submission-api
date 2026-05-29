/**
 * Get the user from the auth object
 * @param {RequestAuth<UserCredentials, AppCredentials, Record<string, unknown>, Record<string, unknown>>} auth - the request auth
 * @returns {UserCredentials} the user
 * @throws {Error}
 */
export function getUser(auth) {
  if (!auth.credentials.user) {
    throw new Error('Missing user credential')
  }

  return auth.credentials.user
}

/**
 * Get the user email from user credentials
 * @param {RequestAuth<UserCredentials, AppCredentials, Record<string, unknown>, Record<string, unknown>>} auth - the request auth
 * @returns {string} the user email
 * @throws {Error}
 */
export function getUserEmail(auth) {
  const user = getUser(auth)
  const userEmail =
    'preferred_username' in user
      ? /** @type {string} */ (user.preferred_username)
      : undefined

  if (!userEmail) {
    throw new Error('User email not found')
  }

  return userEmail
}

/**
 * @import { RequestAuth, UserCredentials, AppCredentials } from '@hapi/hapi'
 */
