import { submissionMessageSchema } from '@defra/forms-model'
import argon2 from 'argon2'
import Joi from 'joi'

import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { deleteEventMessage } from '~/src/messaging/event.js'
import { client } from '~/src/mongo.js'
import { createSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'

const logger = createLogger()

/**
 * @param {Message} message
 * @returns { Promise<RunnerRecordInput> }
 */
export async function mapSubmissionEvent(message) {
  if (!message.MessageId) {
    throw new Error('Unexpected missing Message.MessageId')
  }

  if (!message.Body) {
    throw new Error('Unexpected empty Message.Body')
  }

  /**
   * @type {SaveAndExitMessage}
   */
  const messageBody = JSON.parse(message.Body)

  logger.debug(`Received message of type: ${messageBody.type}`)

  const value = Joi.attempt(messageBody, submissionMessageSchema, {
    abortEarly: false,
    stripUnknown: true
  })

  if (value.data.security.answer) {
    value.data.security.answer = await argon2.hash(value.data.security.answer)
  }

  return {
    messageId: message.MessageId,
    ...value,
    recordCreatedAt: new Date()
  }
}

/**
 * Process submission events
 * @param {Message[]} messages
 * @returns {Promise<{ processed: Message[]; failed: any[] }>}
 */
export async function processSubmissionEvents(messages) {
  /**
   * @param {Message} message
   */
  async function createSaveAndExitEvent(message) {
    const session = client.startSession()

    try {
      return await session.withTransaction(async () => {
        const document = await mapSubmissionEvent(message)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const insertedId = await createSaveAndExitRecord(document, session)

        // TODO - send email including magic link

        logger.info(`Deleting ${message.MessageId}`)

        await deleteEventMessage(message)

        logger.info(`Deleted ${message.MessageId}`)

        return message
      })
    } catch (err) {
      logger.error(
        err,
        `[createSaveAndExitEvent] Failed to insert message - ${getErrorMessage(err)}`
      )
      throw err
    } finally {
      await session.endSession()
    }
  }

  const results = await Promise.allSettled(messages.map(createSaveAndExitEvent))

  const processed = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  const savedMessage = processed.map((item) => item.MessageId).join(',')

  logger.info(`Inserted save-and-exit records: ${savedMessage}`)

  const failed = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason)

  if (failed.length) {
    const failedMessage = failed.map((item) => getErrorMessage(item)).join(',')

    logger.info(`Failed to insert save-and-exit records: ${failedMessage}`)
  }

  return { processed, failed }
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { RunnerRecordInput, SaveAndExitMessage } from '@defra/forms-model'
 */
