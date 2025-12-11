import Jwt from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const oidcJwksUri = config.get('oidcJwksUri')
const oidcVerifyAud = config.get('oidcVerifyAud')
const oidcVerifyIss = config.get('oidcVerifyIss')

const cognitoJwksUri = config.get('cognitoJwksUri')
const cognitoClientId = config.get('cognitoClientId')
const cognitoVerifyIss = config.get('cognitoVerifyIss')

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

  if (app?.client_id !== cognitoClientId) {
    logger.error('Authentication error: Invalid audience')

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
 * @import { AppCredentials, ServerRegisterPluginObject, UserCredentials } from '@hapi/hapi'
 * @import { Artifacts } from '~/src/plugins/auth/types.js'
 */
