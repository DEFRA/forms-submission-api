import { getErrorMessage } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  receiveEventMessages,
  receiveMessageTimeout
} from '~/src/messaging/event.js'
import { processSubmissionEvents } from '~/src/services/submission-events.js'

const queueUrl = config.get('submissionQueueUrl')

const logger = createLogger()

/**
 * @returns {Promise<void>}
 */
export async function runTaskOnce() {
  logger.info('Receiving submission queue messages')

  try {
    const result = await receiveEventMessages(queueUrl)
    const messages = result.Messages
    const messageCount = messages ? messages.length : 0

    logger.info(`Received ${messageCount} submission queue messages`)

    if (messages && messageCount) {
      logger.info('Processing submission queue messages')

      const { processed } = await processSubmissionEvents(messages)

      logger.info(`Processed ${processed.length} submission queue messages`)
    }
  } catch (err) {
    logger.error(
      err,
      `[runTaskOnce] Receive submission messages task failed - ${getErrorMessage(err)}`
    )
  }
}

/**
 * Task to poll for submission messages and store the result in the DB
 * @returns {Promise<void>}
 */
export async function runTask() {
  await runTaskOnce()

  logger.info(
    `Adding submission task to stack in ${receiveMessageTimeout} milliseconds`
  )

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(runTask, receiveMessageTimeout)

  logger.info(`Added submission task to stack`)
}
