import { ecsFormat } from '@elastic/ecs-pino-format'

import { config } from '~/src/config/index.js'
import { getCurrentTraceId } from '~/src/helpers/logging/trace-context.js'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')

const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion,
      serviceName
    })
  },
  'pino-pretty': { transport: { target: 'pino-pretty' } }
}

export const loggerOptions = /** @type {any} */ ({
  enabled: logConfig.isEnabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[/** @type {'ecs' | 'pino-pretty'} */ (logConfig.format)],
  nesting: true,
  mixin() {
    const mixinValues = {}
    const traceId = getCurrentTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    return mixinValues
  }
})

/**
 * @import { Options } from 'hapi-pino'
 * @import { LoggerOptions } from 'pino'
 */
