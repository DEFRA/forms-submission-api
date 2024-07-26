import { pino } from 'pino'

import { loggerOptions } from '~/src/helpers/logging/logger-options.js'

/**
 * Create a logger instance.
 */
export function createLogger() {
  return pino(loggerOptions)
}
