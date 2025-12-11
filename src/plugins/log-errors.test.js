import Boom from '@hapi/boom'

import { onPreResponse } from '~/src/plugins/log-errors.js'

describe('Log errors', () => {
  test('onPreResponse error logger', () => {
    const message = 'Exception occured'
    const response = Boom.boomify(new Error(message))
    const mockRequest = /** @type {Request} */ (
      /** @type {unknown} */ ({
        response,
        logger: {
          error: jest.fn()
        }
      })
    )

    const mockH = /** @type {ResponseToolkit} */ ({
      continue: Symbol('Mock Toolkit')
    })

    onPreResponse(mockRequest, mockH)
    expect(mockRequest.logger.error).toHaveBeenCalledTimes(1)
    expect(mockRequest.logger.error).toHaveBeenCalledWith(
      response,
      `An error occured while processing the request: ${message}`
    )
  })
})

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 */
