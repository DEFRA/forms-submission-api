import { token } from '@hapi/jwt'

import { config } from '~/src/config/index.js'
import { postJson } from '~/src/services/httpService.js'

const notifyAPIKey = config.get('notifyAPIKey')

const INT_36 = 36
const INT_37 = 37
const INT_73 = 73

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
  const { templateId, emailAddress, personalisation } = args

  const postJsonByType =
    /** @type {typeof postJson<{ template_id: string, email_address: string, personalisation: NotifyPersonalisation }>} */ (
      postJson
    )

  return postJsonByType(new URL(NOTIFY_ENDPOINT), {
    payload: {
      template_id: templateId,
      email_address: emailAddress,
      personalisation
    },
    headers: {
      Authorization: 'Bearer ' + createToken(serviceId, apiKeyId)
    }
  })
}
