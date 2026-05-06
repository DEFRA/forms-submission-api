import { token } from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { requireConfig } from '~/src/config/require-config.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { postJson } from '~/src/services/httpService.js'

const INT_36 = 36
const INT_37 = 37
const INT_73 = 73

/**
 * @returns {{ apiKeyId: string, serviceId: string }}
 */
function getNotifyCredentials() {
  const notifyAPIKey = requireConfig(config.get('notifyAPIKey'), 'notifyAPIKey')

  // Extract the two uuids from the notifyApiKey
  // See https://github.com/alphagov/notifications-node-client/blob/main/client/api_client.js#L17
  // Needed until `https://github.com/alphagov/notifications-node-client/pull/200` is published
  const apiKeyId = notifyAPIKey.substring(
    notifyAPIKey.length - INT_36,
    notifyAPIKey.length
  )
  const serviceId = notifyAPIKey.substring(
    notifyAPIKey.length - INT_73,
    notifyAPIKey.length - INT_37
  )

  return { apiKeyId, serviceId }
}

/**
 * @typedef {object} NotifyPersonalisation
 * @property {string} subject - email subject
 * @property {string} body - email body
 */

/**
 * @typedef {object} SendNotificationArgs
 * @property {string} templateId - id of the Notify template
 * @property {string} emailAddress - target email address
 * @property {NotifyPersonalisation} personalisation - email content
 * @property {string} emailReplyToId - reply to email address
 */

export const NOTIFY_ENDPOINT =
  'https://api.notifications.service.gov.uk/v2/notifications/email'

/**
 * @param {string} iss
 * @param {string} secret
 */
function createToken(iss, secret) {
  const iat = Math.round(Date.now() / 1000)

  return token.generate({ iss, iat }, secret, {
    header: { typ: 'JWT', alg: 'HS256' }
  })
}

/**
 * @param {SendNotificationArgs} args
 * @returns
 */
export async function sendNotification(args) {
  const { templateId, emailAddress, personalisation, emailReplyToId } = args
  const { serviceId, apiKeyId } = getNotifyCredentials()

  const postJsonByType =
    /** @type {typeof postJson<{ template_id: string, email_address: string, personalisation: NotifyPersonalisation }>} */ (
      postJson
    )

  const maxRetries = 3
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await postJsonByType(new URL(NOTIFY_ENDPOINT), {
        payload: {
          template_id: templateId,
          email_address: emailAddress,
          personalisation,
          email_reply_to_id: emailReplyToId
        },
        headers: {
          Authorization: 'Bearer ' + createToken(serviceId, apiKeyId)
        }
      })
    } catch (error) {
      lastError = error

      if (attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt)
        logger.warn(
          `Notify request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError
}
