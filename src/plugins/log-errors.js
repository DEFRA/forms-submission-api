import { getErrorMessage } from '@defra/forms-model'
import Boom from '@hapi/boom'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const logErrors = {
  plugin: {
    name: 'log-errors',
    register(server) {
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        if (Boom.isBoom(response)) {
          const message = getErrorMessage(response)

          request.logger.error(
            response,
            `An error occured while processing the request: ${message}`
          )
        }

        return h.continue
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
