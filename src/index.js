import { chdir } from 'node:process'

import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

// Move working directory to build output
chdir(import.meta.dirname)

import('~/src/server.js')
  .then((server) => server.listen())
  .catch((/** @type {unknown} */ error) => {
    logger.info('Server failed to start :(')
    logger.error(error)
    throw error
  })
