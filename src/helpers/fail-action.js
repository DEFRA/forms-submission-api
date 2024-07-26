/**
 * Log and throw and error
 * @type {Method}
 */
export function failAction(request, h, error) {
  request.logger.error(error, error?.message)

  throw error ?? new Error('Unknown error')
}

/**
 * @typedef {import('@hapi/hapi').Lifecycle.Method} Method
 */
