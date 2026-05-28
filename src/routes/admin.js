import { Scopes, idSchema } from '@defra/forms-model'
import Joi from 'joi'

import { logger } from '~/src/helpers/logging/logger.js'
import {
  deleteDlqMessage,
  getDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages,
  resubmitDlqMessage
} from '~/src/messaging/event.js'
import {
  dqlSchema,
  generateFeedbackSubmissionsFileResponseSchema,
  generateFormSubmissionsFileResponseSchema,
  magicLinkSchema,
  messageIdSchema,
  resetSaveAndExitLinkResponseSchema
} from '~/src/models/form.js'
import { resetSaveAndExitLink } from '~/src/services/save-and-exit-service.js'
import {
  generateFeedbackSubmissionsFileForAll,
  generateFeedbackSubmissionsFileForForm,
  generateFormSubmissionsFile
} from '~/src/services/submission-service.js'

const OK_RESPONSE = 200
const NOT_FOUND = 404

const timeoutQuerySchema = Joi.object({
  visibilityTimeout: Joi.number().optional(),
  waitTimeSeconds: Joi.number().optional()
})

const queueAndMessageIdSchema = Joi.object({
  dlq: dqlSchema.required(),
  messageId: Joi.string().required()
})

/**
 * Get the user from the auth object
 * @param {RequestAuth<UserCredentials, AppCredentials, Record<string, unknown>, Record<string, unknown>>} auth - the request auth
 * @returns {UserCredentials} the user
 * @throws {Error}
 */
function getUser(auth) {
  if (!auth.credentials.user) {
    throw new Error('Missing user credential')
  }

  return auth.credentials.user
}

/**
 * Get the user email from user credentials
 * @param {RequestAuth<UserCredentials, AppCredentials, Record<string, unknown>, Record<string, unknown>>} auth - the request auth
 * @returns {string} the user email
 * @throws {Error}
 */
function getUserEmail(auth) {
  const user = getUser(auth)
  const userEmail =
    'preferred_username' in user
      ? /** @type {string} */ (user.preferred_username)
      : undefined

  if (!userEmail) {
    throw new Error('User email not found')
  }

  return userEmail
}

export default [
  /**
   * @satisfies {ServerRoute<ResetSaveAndExit>}
   */
  ({
    method: 'POST',
    path: '/save-and-exit/reset/{link}',
    handler(request) {
      const { params } = request
      const { link } = params

      return resetSaveAndExitLink(link)
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.ResetSaveAndExit}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            link: magicLinkSchema
          })
          .label('resetSaveAndExitLinkParams')
          .required()
      },
      response: {
        status: {
          200: resetSaveAndExitLinkResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<GenerateFormSubmissionsFile>}
   */
  ({
    method: 'POST',
    path: '/submissions/{formId}',
    async handler(request) {
      const { params } = request
      const { formId } = params

      await generateFormSubmissionsFile(formId)

      return {
        message: 'Generate form submissions file success'
      }
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.FormEdit}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            formId: idSchema
          })
          .label('generateFormSubmissionsFileParams')
      },
      response: {
        status: {
          200: generateFormSubmissionsFileResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<GenerateFeedbackSubmissionsFile>}
   */
  ({
    method: 'POST',
    path: '/feedback',
    async handler(request) {
      const { auth } = request

      await generateFeedbackSubmissionsFileForAll(getUserEmail(auth))

      return {
        message: 'Generate feedback submissions file success'
      }
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.FormsFeedbackAllForms}`]
      },
      response: {
        status: {
          200: generateFeedbackSubmissionsFileResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<GenerateFeedbackSubmissionsFile>}
   */
  ({
    method: 'POST',
    path: '/feedback/{formId}',
    async handler(request) {
      const { auth, params } = request
      const { formId } = params

      await generateFeedbackSubmissionsFileForForm(formId, getUserEmail(auth))

      return {
        message: 'Generate feedback submissions file success'
      }
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.FormsFeedback}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            formId: idSchema.required()
          })
          .label('generateFeedbackSubmissionsFileParams')
      },
      response: {
        status: {
          200: generateFeedbackSubmissionsFileResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<DeadLetterQueueRequest>}
   */
  ({
    method: 'GET',
    path: '/admin/deadletter/{dlq}/view',
    async handler(request, h) {
      const { params, query } = request
      const { visibilityTimeout, waitTimeSeconds } = query
      const messages = await receiveDlqMessages(
        params.dlq,
        visibilityTimeout,
        waitTimeSeconds
      )
      return h.response({ messages: messages.Messages ?? [] }).code(OK_RESPONSE)
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            dlq: dqlSchema.required()
          })
          .label('deadLetterQueueParams'),
        query: timeoutQuerySchema
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<DeadLetterQueueMessageRequest>}
   */
  ({
    method: 'GET',
    path: '/admin/deadletter/{dlq}/view/{messageId}',
    async handler(request, h) {
      const { params, query } = request
      const { visibilityTimeout, waitTimeSeconds } = query
      const message = await getDlqMessage(
        params.dlq,
        params.messageId,
        visibilityTimeout,
        waitTimeSeconds
      )
      return h.response({ message }).code(message ? OK_RESPONSE : NOT_FOUND)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: queueAndMessageIdSchema,
        query: timeoutQuerySchema
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<DeadLetterQueueRequest>}
   */
  ({
    method: 'POST',
    path: '/admin/deadletter/{dlq}/redrive',
    async handler(request, h) {
      const { params } = request
      const { dlq } = params
      logger.info(`Redriving DLQ ${dlq}`)
      await redriveDlqMessages(dlq)
      logger.info(`Redriving DLQ ${dlq} triggered successfully`)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            dlq: dqlSchema.required()
          })
          .label('deadLetterQueueParams')
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Params: { dlq: string, messageId: string }, Payload: { messageJson: string } }>}
   */
  ({
    method: 'POST',
    path: '/admin/deadletter/{dlq}/resubmit/{messageId}',
    async handler(request, h) {
      const { params, payload } = request
      const { dlq, messageId } = params
      const { messageJson } = payload
      logger.info(`Resubmitting DLQ message ${messageId} on dlq ${dlq}`)
      await resubmitDlqMessage(dlq, messageId, JSON.stringify(messageJson))
      logger.info(`Resubmitted  DLQ message ${messageId} on dlq ${dlq}`)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: queueAndMessageIdSchema
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<DeadLetterQueueMessageRequest>}
   */
  ({
    method: 'DELETE',
    path: '/admin/deadletter/{dlq}/{messageId}',
    async handler(request, h) {
      const { params, query } = request
      const { dlq, messageId } = params
      logger.info(`Deleting DLQ message ${messageId} on ${dlq}`)
      await deleteDlqMessage(
        dlq,
        messageId,
        query.visibilityTimeout,
        query.waitTimeSeconds
      )
      logger.info(`Deleted DLQ message ${messageId} on ${dlq}`)
      return h.response({ message: 'success' }).code(OK_RESPONSE)
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            dlq: dqlSchema.required(),
            messageId: messageIdSchema.required()
          })
          .label('deadLetterDeleteMessageParams'),
        query: timeoutQuerySchema
      }
    }
  })
]

/**
 * @import { ServerRoute, RequestAuth, UserCredentials, AppCredentials } from '@hapi/hapi'
 * @import { DeadLetterQueueRequest, DeadLetterQueueMessageRequest, GenerateFeedbackSubmissionsFile, GenerateFormSubmissionsFile, ResetSaveAndExit } from '~/src/api/types.js'
 */
