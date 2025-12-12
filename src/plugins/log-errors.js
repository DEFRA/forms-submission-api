import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

/**
 * onPreResponse callback to log errors
 * @param {Request} request - the hapi request
 * @param {ResponseToolkit} h - the hapi response toolkit
 */
export const onPreResponse = (request, h) => {
  const response = request.response

  if (Boom.isBoom(response)) {
    const message = getErrorMessage(response)

    request.logger.error(
      response,
      `An error occurred while processing the request: ${message}`
    )
  }

  return h.continue
}

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const logErrors = {
  plugin: {
    name: 'log-errors',
    register(server) {
      server.ext('onPreResponse', onPreResponse)
    }
  }
}

/**
 * @import { Request, ResponseToolkit, ServerRegisterPluginObject } from '@hapi/hapi'
 */
