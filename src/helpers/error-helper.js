import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

/**
 * Extract underlying Boom message for Boom errors, otherwise default to standard error object
 * @param {unknown} err
 * @returns {string}
 */
export function getBoomErrorMessage(err) {
  if (Boom.isBoom(err)) {
    const boomMessages =
      /** @type {{ error: string, message: string }[] | undefined } */ (
        err.data?.errors
      )
    const boomMessage = boomMessages
      ? boomMessages.map((e) => `${e.error}: ${e.message}`).join(', ')
      : ''
    return `${getErrorMessage(err)} ${boomMessage}`.trim()
  }
  return getErrorMessage(err)
}
