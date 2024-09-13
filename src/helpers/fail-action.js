/**
 * Log and throw and error
 * @type {Lifecycle.Method}
 */
export function failAction(request, h, error) {
  request.logger.error(error, error?.message)

  throw error ?? new Error('Unknown error')
}

/**
 * @import { Lifecycle } from '@hapi/hapi'
 */
