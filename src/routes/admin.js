import { Scopes, idSchema } from '@defra/forms-model'
import Joi from 'joi'

import {
  deleteDlqMessage,
  receiveDlqMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'
import {
  dqlSchema,
  generateFeedbackSubmissionsFileResponseSchema,
  generateFormSubmissionsFileResponseSchema,
  magicLinkSchema,
  receiptHandleSchema,
  resetSaveAndExitLinkResponseSchema
} from '~/src/models/form.js'
import { resetSaveAndExitLink } from '~/src/services/save-and-exit-service.js'
import {
  generateFeedbackSubmissionsFileForAll,
  generateFeedbackSubmissionsFileForForm,
  generateFormSubmissionsFile
} from '~/src/services/submission-service.js'

const OK_RESPONSE = 200

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
    path: '/feedback/{formId?}',
    async handler(request) {
      const { auth, params } = request
      const { formId } = params

      if (formId) {
        await generateFeedbackSubmissionsFileForForm(formId)
      } else {
        if (!auth.credentials.user) {
          throw new Error('Missing user credential')
        }
        await generateFeedbackSubmissionsFileForAll(auth.credentials.user)
      }

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
            formId: idSchema.optional()
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
      const { params } = request
      const messages = await receiveDlqMessages(params.dlq)
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
          .label('deadLetterQueueParams')
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
      await redriveDlqMessages(params.dlq)
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
   * @satisfies {ServerRoute<DeadLetterQueueAndHandleRequest>}
   */
  ({
    method: 'DELETE',
    path: '/admin/deadletter/{dlq}/{receiptHandle}',
    async handler(request, h) {
      const { params } = request
      await deleteDlqMessage(params.dlq, params.receiptHandle)
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
            receiptHandle: receiptHandleSchema.required()
          })
          .label('deadLetterQueueAndHandleParams')
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { DeadLetterQueueRequest, DeadLetterQueueAndHandleRequest, GenerateFeedbackSubmissionsFile, GenerateFormSubmissionsFile, GetSubmissionByReference, ResetSaveAndExit } from '~/src/api/types.js'
 */
