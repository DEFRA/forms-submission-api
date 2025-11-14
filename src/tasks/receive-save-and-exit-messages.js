import { getErrorMessage } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  receiveMessageTimeout,
  receiveMessages
} from '~/src/messaging/event.js'
import { processSaveAndExitEvents } from '~/src/services/save-and-exit-events.js'

const queueUrl = config.get('saveAndExitQueueUrl')
const logger = createLogger()

/**
 * @returns {Promise<void>}
 */
export async function runTaskOnce() {
  logger.info('Receiving save and exit queue messages')

  try {
    const result = await receiveMessages(queueUrl)
    const messages = result.Messages
    const messageCount = messages ? messages.length : 0

    logger.info(`Received ${messageCount} save and exit queue messages`)

    if (messages && messageCount) {
      logger.info('Processing save and exit queue messages')

      const { processed } = await processSaveAndExitEvents(messages)

      logger.info(`Processed ${processed.length} save and exit queue messages`)
    }
  } catch (err) {
    logger.error(
      err,
      `[runTaskOnce] Receive save and exit messages task failed - ${getErrorMessage(err)}`
    )
  }
}

/**
 * Task to poll for save and exit messages and store the result in the DB
 * @returns {Promise<void>}
 */
export async function runTask() {
  await runTaskOnce()

  logger.info(
    `Adding save and exit task to stack in ${receiveMessageTimeout} milliseconds`
  )

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(runTask, receiveMessageTimeout)

  logger.info(`Added save and exit task to stack`)
}
