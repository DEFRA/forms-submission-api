import { getErrorMessage } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import {
  receiveMessageTimeout,
  receiveMessages
} from '~/src/messaging/event.js'
import { processSubmissionMessages } from '~/src/services/submission-events.js'

const queueUrl = config.get('submissionQueueUrl')

/**
 * @returns {Promise<void>}
 */
export async function runTaskOnce() {
  try {
    const result = await receiveMessages(queueUrl)
    const messages = result.Messages
    const messageCount = messages ? messages.length : 0

    logger.info(`Received ${messageCount} submission queue messages`)

    if (messages && messageCount) {
      const { processed } = await processSubmissionMessages(messages)

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

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(runTask, receiveMessageTimeout)
}
