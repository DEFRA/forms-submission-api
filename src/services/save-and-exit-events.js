import {
  SubmissionEventMessageType,
  getErrorMessage,
  submissionMessageSchema
} from '@defra/forms-model'
import argon2 from 'argon2'
import Joi from 'joi'

import { config } from '~/src/config/index.js'
import { requireConfig } from '~/src/config/require-config.js'
import { getBoomErrorMessage } from '~/src/helpers/error-helper.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { translator as createdTranslator } from '~/src/i18n/createTranslator.js'
import { deleteMessage } from '~/src/messaging/event.js'
import { client } from '~/src/mongo.js'
import { createSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'
import { getFormMetadataById } from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'

const queueUrl = config.get('saveAndExitQueueUrl')
const expiryInDays = config.get('saveAndExitExpiryInDays')
/**
 *
 * @returns Record<string,string>
 */
function getNotifyEmailConfig() {
  return {
    templateId: requireConfig(
      config.get('notifyTemplateId'),
      'notifyTemplateId'
    ),
    emailReplyToId: requireConfig(
      config.get('notifyReplyToId'),
      'notifyReplyToId'
    )
  }
}

/**
 * @param {Message} message
 * @returns { Promise<{ messageId: string, parsedContent: SaveAndExitMessage | SaveAndExitV2Message}> }
 */
export async function mapSaveAndExitMessageToData(message) {
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

  if (
    value.type === SubmissionEventMessageType.RUNNER_SAVE_AND_EXIT &&
    value.data.security.answer
  ) {
    value.data.security.answer = await argon2.hash(
      value.data.security.answer.toLowerCase()
    )
  }

  return {
    messageId: message.MessageId,
    parsedContent: value
  }
}

/**
 * @param {{ messageId: string, parsedContent: SaveAndExitMessage}} message
 * @returns { Omit<SaveAndExitV1Document, 'expireAt'> }
 */
export function mapSaveAndExitDataToDocumentV1(message) {
  const { form, security, state, email, magicLinkGroupId } =
    message.parsedContent.data
  return {
    magicLinkId: message.messageId,
    magicLinkGroupId: magicLinkGroupId ?? '',
    form: {
      id: form.id,
      isPreview: form.isPreview,
      status: form.status,
      baseUrl: form.baseUrl,
      title: form.title
    },
    email,
    security: {
      question: security.question,
      answer: security.answer
    },
    state,
    invalidPasswordAttempts: 0,
    createdAt: new Date(),
    version: 1,
    notify: {
      expireLockId: null,
      expireLockTimestamp: null,
      expireEmailSentTimestamp: null
    }
  }
}

/**
 * @param {{ messageId: string, parsedContent: SaveAndExitV2Message}} message
 * @returns { Omit<SaveAndExitV2Document, 'expireAt'> }
 */
export function mapSaveAndExitDataToDocumentV2(message) {
  const { form, state, auth, email } = message.parsedContent.data

  return {
    form: {
      id: form.id,
      isPreview: form.isPreview,
      status: form.status,
      baseUrl: form.baseUrl,
      title: form.title
    },
    auth,
    email,
    state,
    magicLinkId: '',
    createdAt: new Date(),
    version: 1,
    notify: {
      expireLockId: null,
      expireLockTimestamp: null,
      expireEmailSentTimestamp: null
    }
  }
}

/**
 * @param {Omit<SaveAndExitV1Document, 'expireAt'>} document
 * @param {string} formTitle
 * @returns {SendNotificationArgs}
 */
export function constructEmailContentV1(document, formTitle) {
  const { templateId, emailReplyToId } = getNotifyEmailConfig()

  const emailSubject = 'Form progress saved'

  const emailBody = `# Form progress saved
  Your progress with ${formTitle} has been saved.

  [Continue with your form](${document.form.baseUrl}/resume-form/${document.form.id}/${document.magicLinkId})

  ^ If you want to save your progress again after resuming your form, you will need to repeat the save process to generate a new link.

  The link is valid for ${expiryInDays} days. After that time, your saved information will be deleted.
  `

  return {
    emailAddress: document.email,
    templateId,
    personalisation: {
      subject: emailSubject,
      body: emailBody
    },
    emailReplyToId
  }
}

/**
 * @param {Omit<SaveAndExitV2Document, 'expireAt'>} document
 * @param {{ id: string; title: string; status: FormStatus; isPreview: boolean; baseUrl: string }} form
 * @param {SubmissionTranslator} translator
 * @returns {Promise<SendNotificationArgs>}
 */
export async function constructEmailContentV2(document, form, translator) {
  const { templateId, emailReplyToId } = getNotifyEmailConfig()

  const { t } = translator

  const formTitle = form.title

  const meta = await getFormMetadataById(form.id)

  const previewDraftStub = form.isPreview ? `preview/${form.status}/` : ''

  const emailSubject = `${t('saveAndExit.progressSavedShort')}: ${formTitle}`

  const emailBody = `# ${t('saveAndExit.progressSavedShort')}
  ${t('saveAndExit.progressSavedLong', { formTitle })}

  ${t('saveAndExit.signInToContinue', { formTitle })}

  ${t('saveAndExit.sameEmailOrNumber')}

  ^ [  ${t('saveAndExit.continueForm')}](${document.form.baseUrl}/homepage/${previewDraftStub}${meta.slug})

  ${t('saveAndExit.expiryIfNoSignIn', { expiryInDays })}
  `

  return {
    emailAddress: document.email,
    templateId,
    personalisation: {
      subject: emailSubject,
      body: emailBody
    },
    emailReplyToId
  }
}

/**
 * Process submission events
 * @param {Message[]} messages
 * @returns {Promise<{ processed: Message[]; failed: any[] }>}
 */
export async function processSaveAndExitEvents(messages) {
  /**
   * @param {Message} message
   */
  async function processSaveAndExitEvent(message) {
    const session = client.startSession()

    try {
      return await session.withTransaction(async () => {
        const data = await mapSaveAndExitMessageToData(message)

        const isV1 =
          data.parsedContent.type ===
          SubmissionEventMessageType.RUNNER_SAVE_AND_EXIT

        const emailContent = isV1
          ? await handleSaveAndExitV1(data, session)
          : await handleSaveAndExitV2(data, session)

        await sendNotification(emailContent)

        logger.info(`Deleting save and exit message ${message.MessageId}`)

        await deleteMessage(queueUrl, message)

        logger.info(`Deleted save and exit message ${message.MessageId}`)

        return message
      })
    } catch (err) {
      logger.error(
        err,
        `[processSaveAndExitEvents] Failed to process message - ${getBoomErrorMessage(err)}`
      )
      throw err
    } finally {
      await session.endSession()
    }
  }

  const results = await Promise.allSettled(
    messages.map(processSaveAndExitEvent)
  )

  const processed = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  const savedMessage = processed.map((item) => item.MessageId).join(',')

  logger.info(`Inserted save and exit records: ${savedMessage}`)

  const failed = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason)

  if (failed.length) {
    const failedMessage = failed.map((item) => getErrorMessage(item)).join(',')

    logger.info(`Failed to insert save and exit records: ${failedMessage}`)
  }

  return { processed, failed }
}

/**
 * Handle a V1 message (map data, save data to DB, construct email content)
 * @param {{ messageId: string, parsedContent: SaveAndExitMessage | SaveAndExitV2Message }} data
 * @param {ClientSession} session
 * @returns {Promise<SendNotificationArgs>} email content
 */
async function handleSaveAndExitV1(data, session) {
  const dataTyped =
    /** @type {{ messageId: string, parsedContent: SaveAndExitMessage}} */ (
      data
    )
  const document = mapSaveAndExitDataToDocumentV1(dataTyped)
  await createSaveAndExitRecord(document, session)
  return constructEmailContentV1(
    /** @type {Omit<SaveAndExitV1Document, "expireAt">} */ (document),
    data.parsedContent.data.form.title
  )
}

/**
 * Handle a V2 message (map data, save data to DB, construct email content)
 * @param {{ messageId: string, parsedContent: SaveAndExitMessage | SaveAndExitV2Message }} data
 * @param {ClientSession} session
 * @returns {Promise<SendNotificationArgs>} email content
 */
async function handleSaveAndExitV2(data, session) {
  const dataTyped =
    /** @type {{ messageId: string, parsedContent: SaveAndExitV2Message}} */ (
      data
    )
  const document = mapSaveAndExitDataToDocumentV2(dataTyped)
  await createSaveAndExitRecord(document, session)
  return await constructEmailContentV2(
    document,
    data.parsedContent.data.form,
    createdTranslator
  )
}

/**
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { ClientSession } from 'mongodb'
 * @import { SendNotificationArgs } from '~/src/services/notify.js'
 * @import { FormStatus, SaveAndExitMessage, SaveAndExitV2Message } from '@defra/forms-model'
 * @import { SubmissionTranslator } from '~/src/api/types.js'
 * @import { SaveAndExitV1Document, SaveAndExitV2Document } from '~/src/api/types.js'
 */
