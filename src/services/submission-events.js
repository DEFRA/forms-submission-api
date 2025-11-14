import { formAdapterSubmissionMessagePayloadSchema } from '@defra/forms-engine-plugin/engine/types/schema.js'
import { getErrorMessage } from '@defra/forms-model'
import Joi from 'joi'

import { config } from '~/src/config/index.js'
import { addMonths } from '~/src/helpers/date-helper.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { deleteMessage } from '~/src/messaging/event.js'
import { client } from '~/src/mongo.js'
import { createSubmissionRecord } from '~/src/repositories/submission-repository.js'

const logger = createLogger()

const queueUrl = config.get('submissionQueueUrl')

/**
 * @param {Message} message
 * @returns {{ messageId: string, parsedContent: FormAdapterSubmissionMessagePayload }}
 */
export function mapSubmissionMessageToData(message) {
  if (!message.MessageId) {
    throw new Error('Unexpected missing Message.MessageId')
  }

  if (!message.Body) {
    throw new Error('Unexpected empty Message.Body')
  }

  /**
   * @type {FormAdapterSubmissionMessagePayload}
   */
  const messageBody = JSON.parse(message.Body)

  const value = Joi.attempt(
    messageBody,
    formAdapterSubmissionMessagePayloadSchema,
    {
      abortEarly: false,
      stripUnknown: true
    }
  )

  return {
    messageId: message.MessageId,
    parsedContent: value
  }
}

/**
 * @param {{ messageId: string, parsedContent: FormAdapterSubmissionMessagePayload}} message
 * @returns {FormSubmissionDocument}
 */
export function mapSubmissionDataToDocument(message) {
  const months = 9
  const recordCreatedAt = new Date()
  const expireAt = addMonths(recordCreatedAt, months)

  return {
    ...message.parsedContent,
    recordCreatedAt,
    expireAt
  }
}

/**
 * Process submission events
 * @param {Message[]} messages
 * @returns {Promise<{ processed: Message[]; failed: any[] }>}
 */
export async function processSubmissionMessages(messages) {
  /**
   * @param {Message} message
   */
  async function processSubmissionMessage(message) {
    const session = client.startSession()

    try {
      return await session.withTransaction(async () => {
        const data = mapSubmissionMessageToData(message)
        const document = mapSubmissionDataToDocument(data)

        await createSubmissionRecord(document, session)

        logger.info(`Deleting submission message ${message.MessageId}`)

        await deleteMessage(queueUrl, message)

        logger.info(`Deleted submission message ${message.MessageId}`)

        return message
      })
    } catch (err) {
      logger.error(
        err,
        `[processSubmissionEvent] Failed to process message - ${getErrorMessage(err)}`
      )
      throw err
    } finally {
      await session.endSession()
    }
  }

  const results = await Promise.allSettled(
    messages.map(processSubmissionMessage)
  )

  const processed = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  const savedMessage = processed.map((item) => item.MessageId).join(',')

  logger.info(`Inserted submission records: ${savedMessage}`)

  const failed = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason)

  if (failed.length) {
    const failedMessage = failed.map((item) => getErrorMessage(item)).join(',')

    logger.info(`Failed to insert submission records: ${failedMessage}`)
  }

  return { processed, failed }
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { FormAdapterSubmissionMessagePayload } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
