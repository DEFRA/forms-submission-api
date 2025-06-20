/**
 * Log and throw and error
 * @type {Lifecycle.Method}
 */
export function failAction(request, h, error) {
  const err = error instanceof Error ? error : new Error('Unknown error')
  request.logger.error(
    err,
    `[validationFailed] Request validation failed for ${request.method} ${request.url.pathname} - ${err.message}`
  )

  throw error ?? new Error('Unknown error')
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
