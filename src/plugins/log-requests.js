import hapiPino from 'hapi-pino'

import { loggerOptions } from '~/src/helpers/logging/logger-options.js'

/**
 * @satisfies {ServerRegisterPluginObject<Options>}
 */
export const logRequests = {
  plugin: hapiPino,
  options: {
    .../** @type {any} */ (loggerOptions),
    log4xxResponseErrors: true,
    logRequestComplete: true,
    customRequestCompleteMessage(request, responseTime) {
      return `[response] ${request.method} ${request.path} ${request.raw.res.statusCode} (${responseTime}ms)`
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { Options } from 'hapi-pino'
 */
