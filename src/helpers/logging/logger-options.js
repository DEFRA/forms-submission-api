import { ecsFormat } from '@elastic/ecs-pino-format'

import { config } from '~/src/config/index.js'

const serviceName = config.get('serviceName')

/**
 * @satisfies {Options}
 */
export const loggerOptions = {
  enabled: config.get('log.isEnabled'),
  ignorePaths: ['/health'],
  redact: {
    paths: config.get('log.redact'),
    remove: true
  },
  level: config.get('log.level'),
  ...(config.get('log.format') === 'pino-pretty'
    ? { transport: { target: 'pino-pretty' } }
    : /** @type {Omit<LoggerOptions, 'mixin' | 'transport'>} */ (
        ecsFormat({
          serviceName
        })
      ))
}

/**
 * @import { Options } from 'hapi-pino'
 * @import { LoggerOptions } from 'pino'
 */
