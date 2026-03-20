import Boom from '@hapi/boom'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { getJson } from '~/src/services/httpService.js'

const entitlementUrl = config.get('entitlementUrl')
const entitlementsEndpoint = new URL('/', entitlementUrl)
const logger = createLogger()

/**
 * Fetches user scopes from the entitlements API
 * @param {string} oid - User OID
 * @param {string} [authToken] - JWT token for authentication
 * @returns {Promise<string[]>} Array of scopes
 */
export async function getUserScopes(oid, authToken) {
  const requestUrl = new URL(`./users/${oid}`, entitlementsEndpoint)

  const options = {}
  if (authToken) {
    options.headers = {
      Authorization: `Bearer ${authToken}`
    }
  }

  try {
    logger.info(`[entitlementsApi] Fetching scopes for user ${oid}`)

    const getJsonByType = /** @type {typeof getJson<any>} */ (getJson)
    const { body } = await getJsonByType(requestUrl, options)

    if (body?.entity?.scopes) {
      logger.info(
        `[entitlementsApi] Retrieved ${body.entity.scopes.length} scopes for user ${oid}`
      )
      return body.entity.scopes
    }

    logger.warn(
      `[entitlementsApi] Invalid response format for user ${oid}, expected entity object with scopes array`
    )
    return []
  } catch (err) {
    if (Boom.isBoom(err)) {
      logger.error(
        err,
        `[entitlementsApi] Failed to fetch scopes for user ${oid}`
      )
    } else {
      logger.error(
        err,
        `[entitlementsApi] Failed to fetch scopes for user ${oid}:`
      )
    }

    return []
  }
}
