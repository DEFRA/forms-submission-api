import Boom from '@hapi/boom'
import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const oidcJwksUri = config.get('oidcJwksUri')
const oidcVerifyAud = config.get('oidcVerifyAud')
const oidcVerifyIss = config.get('oidcVerifyIss')

const cognitoJwksUri = config.get('cognitoJwksUri')
const cognitoVerifyIss = config.get('cognitoVerifyIss')

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
 * Additional validation for azure oidc token based authentiation
 * @param {Artifacts<UserCredentials>} artifacts
 */
export function validateAuth(artifacts) {
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

  return {
    isValid: true,
    credentials: { user }
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
 * @import { AppCredentials, Request, ResponseToolkit, ServerRegisterPluginObject, UserCredentials } from '@hapi/hapi'
 * @import { Artifacts } from '~/src/plugins/auth/types.js'
 */
