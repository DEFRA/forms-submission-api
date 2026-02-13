import { formSubmitPayloadSchema, idSchema } from '@defra/forms-model'
import Joi from 'joi'

import {
  formSubmitResponseSchema,
  generateFeedbackSubmissionsFileResponseSchema,
  generateFormSubmissionsFileResponseSchema,
  getSavedLinkResponseSchema,
  magicLinkSchema,
  resetSaveAndExitLinkResponseSchema,
  validateSavedLinkResponseSchema
} from '~/src/models/form.js'
import { submit } from '~/src/services/file-service.js'
import {
  getSavedLinkDetails,
  resetSaveAndExitLink,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'
import {
  generateFeedbackSubmissionsFileForAll,
  generateFeedbackSubmissionsFileForForm,
  generateFormSubmissionsFile
} from '~/src/services/submission-service.js'

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
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { GenerateFeedbackSubmissionsFile, GenerateFormSubmissionsFile, GetSavedLinkParams, ResetSaveAndExit, ValidateSaveAndExit } from '~/src/api/types.js'
 */
