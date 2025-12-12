import { getErrorMessage } from '@defra/forms-model'

/**
 * Listens to hapi events and logs to pino
 * @param {pino.Logger} logger - the pino logger
 * @param {LogEvent | RequestEvent} event - the hapi event
 * @param {Record<string, true>} tags - the event tags
 */
export const logListener = (logger, event, tags) => {
  const tagstr = event.tags.join(',')
  const message = `Channel: ${event.channel}, Tags: [${tagstr}]`

  if ('error' in tags && event.channel !== 'internal') {
    logger.error(
      event.error,
      `${message}, Error: ${getErrorMessage(event.error)}`
    )
  } else {
    const data =
      typeof event.data === 'string'
        ? event.data
        : `type - ${typeof event.data}`

    logger.info(`${message}, Data: ${data}`)
  }
}

/**
 * @type {ServerRegisterPluginObject<void>}
 */
export const forwardLogs = {
  plugin: {
    name: 'forward-logs',
    register: (server) => {
      server.events.on('log', (event, tags) => {
        logListener(server.logger, event, tags)
      })

      server.events.on('request', (request, event, tags) => {
        logListener(request.logger, event, tags)
      })
    }
  }
}

/**
 * @import pino from 'pino'
 * @import {  LogEvent, RequestEvent, ServerRegisterPluginObject } from '@hapi/hapi'
 */
