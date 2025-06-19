/**
 * Test endpoint that demonstrates different error logging approaches
 */
export default [
  {
    method: 'GET',
    path: '/test-error/direct',
    /**
     * @param {import('@hapi/hapi').Request} request
     */
    handler(request) {
      request.logger.info('Testing direct error logging')

      const error = new Error('Direct error test')
      error.name = 'DirectTestError'

      request.logger.error(error, '[directError] Testing direct error logging')

      return { message: 'Direct error logged' }
    },
    options: {
      auth: false,
      description: 'Test direct error logging: logger.error(err, "message")'
    }
  },

  {
    method: 'GET',
    path: '/test-error/wrapped',
    /**
     * @param {import('@hapi/hapi').Request} request
     */
    handler(request) {
      request.logger.info('Testing wrapped error logging')

      const error = new Error('Wrapped error test')
      error.name = 'WrappedTestError'

      request.logger.error(
        { err: error },
        '[wrappedError] Testing wrapped error logging'
      )

      return { message: 'Wrapped error logged' }
    },
    options: {
      auth: false,
      description:
        'Test wrapped error logging: logger.error({ err }, "message")'
    }
  },

  {
    method: 'GET',
    path: '/test-error/typed',
    /**
     * @param {import('@hapi/hapi').Request} request
     */
    handler(request) {
      request.logger.info('Testing typed error logging')

      const error = new Error('Typed error test')
      error.name = 'TypedTestError'

      request.logger.error(
        { err: error, type: 'CustomBusinessError' },
        '[typedError] Testing error with custom type'
      )

      return { message: 'Typed error logged' }
    },
    options: {
      auth: false,
      description:
        'Test error logging with custom type: logger.error({ err, type }, "message")'
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
