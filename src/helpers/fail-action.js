/**
 * Log and throw and error
 * @type {Lifecycle.Method}
 */
export function failAction(request, h, error) {
  const err = error instanceof Error ? error : new Error('Unknown error')
  request.logger.error(
    {
      err,
      message: err.message,
      stack: err.stack,
      url: request.url.href,
      method: request.method
    },
    `Request validation failed: ${err.message}`
  )

  throw error ?? new Error('Unknown error')
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
