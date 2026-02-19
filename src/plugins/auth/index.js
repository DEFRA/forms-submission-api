import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'
import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  getDefaultScopes,
  getUserScopes
} from '~/src/services/entitlements-service.js'

const oidcJwksUri = config.get('oidcJwksUri')
const oidcVerifyAud = config.get('oidcVerifyAud')
const oidcVerifyIss = config.get('oidcVerifyIss')
const roleEditorGroupId = config.get('roleEditorGroupId')

const cognitoJwksUri = config.get('cognitoJwksUri')
const cognitoVerifyIss = config.get('cognitoVerifyIss')
const useEntitlementApi = config.get('useEntitlementApi')

/**
 * Raw configuration mapping Cognito client IDs to arrays of permitted retrievalKeys.
 * @type {Record<string, string[]>}
 */
const cognitoClientIdsConfig = JSON.parse(config.get('cognitoClientIds'))

/**
 * Map of Cognito client IDs to their permitted retrievalKeys.
 * Converted to Sets for better performance.
 * @type {Record<string, Set<string> | undefined>}
 */
const cognitoClientIds = Object.fromEntries(
  Object.entries(cognitoClientIdsConfig).map(([clientId, keys]) => [
    clientId,
    new Set(keys)
  ])
)

const logger = createLogger()

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const auth = {
  plugin: {
    name: 'auth',
    async register(server) {
      await server.register(Jwt)

      server.auth.strategy('azure-oidc-token', 'jwt', {
        keys: {
          uri: oidcJwksUri
        },
        verify: {
          aud: oidcVerifyAud,
          iss: oidcVerifyIss,
          sub: false,
          nbf: true,
          exp: true
        },
        validate: validateAuth
      })

      server.auth.strategy('cognito-access-token', 'jwt', {
        keys: {
          uri: cognitoJwksUri
        },
        verify: {
          aud: false,
          iss: cognitoVerifyIss,
          sub: false,
          nbf: true,
          exp: true
        },
        validate: validateAppAuth
      })

      // Set as the default strategy
      server.auth.default('azure-oidc-token')
    }
  }
}

/**
 * Processes the groups claim from the token payload
 * @param {unknown} groupsClaim - The groups claim from the token
 * @param {string} oid - User OID for logging purposes
 * @returns {string[]} Processed groups array
 */
function processGroupsClaim(groupsClaim, oid) {
  let processedGroups = []

  // For the integration tests, the OIDC mock server sends the 'groups' claim as a stringified JSON array which
  // requires parsing, while a real Azure AD would typically provide 'groups' as a proper array.
  // We handle both formats for flexibility between test and production environments.
  if (typeof groupsClaim === 'string') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- we know this is a stringified JSON array
      const parsed = JSON.parse(groupsClaim)
      if (Array.isArray(parsed)) {
        processedGroups = parsed
      } else {
        logger.warn(
          `[authGroupsInvalid] Auth: User ${oid}: 'groups' claim was string but not valid JSON array: '${groupsClaim}'`
        )
      }
    } catch (err) {
      logger.error(
        err,
        `[authGroupsParseError] Auth: User ${oid}: Failed to parse 'groups' claim - ${getErrorMessage(err)}`
      )
    }
  } else if (Array.isArray(groupsClaim)) {
    processedGroups = groupsClaim
  } else {
    processedGroups = []
  }

  return processedGroups
}

/**
 * Additional validation for azure oidc token based authentiation
 * @param {Artifacts<UserCredentials>} artifacts - JWT artifacts
 * @returns {Promise<{ isValid: boolean, credentials?: any }>} Validation result
 */
export async function validateAuth(artifacts) {
  const user = artifacts.decoded.payload

  if (!user) {
    logger.error('Authentication error: Missing user')
    return {
      isValid: false
    }
  }

  const { oid } = user

  if (!oid) {
    logger.error('Authentication error: user.oid is not a string or is missing')
    return {
      isValid: false
    }
  }

  logger.debug(`User ${oid}: passed authentication`)

  const groupsClaim = user.groups
  const processedGroups = processGroupsClaim(groupsClaim, oid)

  if (!useEntitlementApi && !processedGroups.includes(roleEditorGroupId)) {
    logger.warn(
      `[authGroupNotFound] Auth: User ${oid}: Authorisation failed. Required group "${roleEditorGroupId}" not found`
    )
    return {
      isValid: false
    }
  }

  let userScopes = []

  if (useEntitlementApi) {
    const authToken = artifacts.token
    userScopes = await getUserScopes(oid, authToken)
  } else {
    userScopes = getDefaultScopes()
  }

  return {
    isValid: true,
    credentials: {
      user: {
        ...user,
        groups: processedGroups
      },
      scope: userScopes
    }
  }
}

/**
 * Additional validation for cognito access token based authentiation
 * @param {Artifacts<AppCredentials>} artifacts
 */
export function validateAppAuth(artifacts) {
  const app = artifacts.decoded.payload

  if (!app?.client_id || !(app.client_id in cognitoClientIds)) {
    logger.error(`Authentication error: Invalid client ID ${app?.client_id}`)

    return {
      isValid: false
    }
  }

  if (app.token_use !== 'access') {
    logger.error(`Authentication error: Invalid token_use '${app.token_use}'`)

    return {
      isValid: false
    }
  }

  logger.debug(
    `Access token for subject '${app.sub}' for '${app.client_id}': Passed authentication`
  )

  return {
    isValid: true,
    credentials: { app }
  }
}

/**
 * Validates that a retrievalKey is permitted for a given Cognito client.
 * Routes should extract the retrievalKey and clientId from their request and call this function.
 * @example
 * const clientId = request.auth.credentials.app.client_id
 * const { retrievalKey } = request.payload
 * validateRetrievalKey(clientId, retrievalKey)
 * @param {string} clientId - The Cognito client ID
 * @param {string} retrievalKey - The retrievalKey to validate
 * @throws {Boom.Boom} Throws forbidden error if retrievalKey is not permitted for the client
 */
export function validateRetrievalKey(clientId, retrievalKey) {
  const permittedKeys = cognitoClientIds[clientId]

  if (!permittedKeys?.has(retrievalKey)) {
    logger.error(
      `Authorization error: retrievalKey '${retrievalKey}' not permitted for client ID ${clientId}`
    )

    throw Boom.forbidden('retrievalKey not permitted for client')
  }

  logger.debug(
    `retrievalKey '${retrievalKey}' validated for client ID ${clientId}`
  )
}

/**
 * @import { AppCredentials, ServerRegisterPluginObject, UserCredentials } from '@hapi/hapi'
 * @import { Artifacts } from '~/src/plugins/auth/types.js'
 */
