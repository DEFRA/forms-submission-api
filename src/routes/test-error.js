/**
 * Test endpoint that throws an error to test logging format
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/test-error',
  handler(request) {
    request.logger.info('Test error endpoint called - about to simulate error')

    try {
      const error = new Error('Test error for logging verification')
      error.name = 'TestError'
      throw error
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')

      request.logger.error(
        {
          err: error
        },
        `[testError] Test error occurred: ${error.message}`
      )

      throw error
    }
  },
  options: {
    auth: false,
    description: 'Simple test endpoint to verify error logging format'
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
