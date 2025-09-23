import { getErrorMessage } from '@defra/forms-model'

/**
 * Log and throw and error
 * @type {Lifecycle.Method}
 */
export const failAction = (request, _h, err) => {
  const message = getErrorMessage(err)

  request.logger.error(
    err,
    `[validationFailed] Request validation failed - ${message}`
  )

  throw err instanceof Error ? err : new Error(message)
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
