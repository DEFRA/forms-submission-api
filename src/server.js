import { createServer } from '~/src/api/server.js'
import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

process.on('unhandledRejection', (error) => {
  const err = error instanceof Error ? error : new Error('Unknown error')
  logger.info('Unhandled rejection')
  logger.error(
    {
      message: err.message,
      stack_trace: err.stack,
      type: err.name
    },
    `[unhandledRejection] Unhandled promise rejection: ${err.message}`
  )
  throw error
})

/**
 * Starts the server.
 */
export async function listen() {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )
}
