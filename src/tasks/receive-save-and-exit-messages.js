import { getErrorMessage } from '@defra/forms-model'

import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  receiveEventMessages,
  receiveMessageTimeout
} from '~/src/messaging/event.js'
import { processSubmissionEvents } from '~/src/services/events.js'

const logger = createLogger()

/**
 * @returns {Promise<void>}
 */
export async function runTaskOnce() {
  logger.info('Receiving queue messages')

  try {
    const result = await receiveEventMessages()
    const messages = result.Messages
    const messageCount = messages ? messages.length : 0

    logger.info(`Received ${messageCount} queue messages`)

    if (messages && messageCount) {
      logger.info('Processing queue messages')

      const { processed } = await processSubmissionEvents(messages)

      logger.info(`Processed ${processed.length} queue messages`)
    }
  } catch (err) {
    logger.error(
      err,
      `[runTaskOnce] Receive messages task failed - ${getErrorMessage(err)}`
    )
  }
}

/**
 * Task to poll for messages and store the result in the DB
 * @returns {Promise<void>}
 */
export async function runTask() {
  await runTaskOnce()

  logger.info(`Adding task to stack in ${receiveMessageTimeout} milliseconds`)

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(runTask, receiveMessageTimeout)

  logger.info(`Added task to stack`)
}
