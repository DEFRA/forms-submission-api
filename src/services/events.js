import { submissionMessageSchema } from '@defra/forms-model'
import argon2 from 'argon2'
import Joi from 'joi'

import { config } from '~/src/config/index.js'
import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { deleteEventMessage } from '~/src/messaging/event.js'
import { client } from '~/src/mongo.js'
import { createSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'
import { sendNotification } from '~/src/services/notify.js'

const logger = createLogger()

const expiryInDays = config.get('saveAndExitExpiryInDays')

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
 * @param {RunnerRecordInput} document
 * @returns {SendNotificationArgs}
 */
export function constructEmailContent(document) {
  const emailSubject = 'Form progress saved'

  const emailBody = `# Form progress saved
  Your progress with ${document.data.form.title} has been saved.

  [Continue with your form](https://defraforms.gov.uk/save-and-exit-resume/${document.data.form.id}/${document.messageId})

  ^ The link will only work once. If you want to save your progress again after resuming your form, you will need to repeat the save process to generate a new link.

  The link is valid for ${expiryInDays} days. After that time, your saved information will be deleted.
  `

  return {
    emailAddress: document.data.email,
    templateId: config.get('notifyTemplateId'),
    personalisation: {
      subject: emailSubject,
      body: emailBody
    }
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

        await createSaveAndExitRecord(document, session)

        const emailContent = constructEmailContent(document)
        await sendNotification(emailContent)

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
 * @import { SendNotificationArgs } from '~/src/services/notify.js'
 * @import { RunnerRecordInput, SaveAndExitMessage } from '@defra/forms-model'
 */
