import { formSubmitPayloadSchema, idSchema } from '@defra/forms-model'
import Joi from 'joi'

import {
  formSubmitResponseSchema,
  generateSubmissionsFileResponseSchema,
  getSavedLinkResponseSchema,
  magicLinkSchema,
  validateSavedLinkResponseSchema
} from '~/src/models/form.js'
import { submit } from '~/src/services/file-service.js'
import {
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'
import { generateSubmissionsFile } from '~/src/services/submission-service.js'

export default [
  /**
   * @satisfies {ServerRoute<{ Payload: SubmitPayload }>}
   */
  ({
    method: 'POST',
    path: '/submit',
    async handler(request) {
      const { payload } = request

      const files = await submit(payload)

      return {
        message: 'Submit completed',
        result: { files }
      }
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        payload: formSubmitPayloadSchema
      },
      response: {
        status: {
          200: formSubmitResponseSchema
        }
      }
    }
  }),

  /**
   * @type {ServerRoute<{ Params: GetSavedLinkParams }>}
   */
  ({
    method: 'GET',
    path: '/save-and-exit/{link}',
    async handler(request) {
      const { link } = request.params

      return getSavedLinkDetails(link)
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        params: Joi.object()
          .keys({
            link: magicLinkSchema
          })
          .label('getSavedLinkParams')
      },
      response: {
        status: {
          200: getSavedLinkResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<ValidateSaveAndExit>}
   */
  ({
    method: 'POST',
    path: '/save-and-exit/{link}',
    async handler(request) {
      const { params, payload } = request
      const { link } = params
      const { securityAnswer } = payload

      return validateSavedLinkCredentials(link, securityAnswer)
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        params: Joi.object()
          .keys({
            link: magicLinkSchema
          })
          .label('validateSavedLinkParams'),
        payload: Joi.object({
          securityAnswer: Joi.string().required()
        }).label('validateSavedLinkPayload')
      },
      response: {
        status: {
          200: validateSavedLinkResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<GenerateSubmissionFile>}
   */
  ({
    method: 'POST',
    path: '/submissions/{formId}',
    async handler(request) {
      const { params } = request
      const { formId } = params

      await generateSubmissionsFile(formId)

      return {
        message: 'Generate file success'
      }
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        params: Joi.object()
          .keys({
            formId: idSchema
          })
          .label('generateSubmissionFileParams')
      },
      response: {
        status: {
          200: generateSubmissionsFileResponseSchema
        }
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { GenerateSubmissionFile, GetSavedLinkParams, ValidateSaveAndExit } from '~/src/api/types.js'
 */
