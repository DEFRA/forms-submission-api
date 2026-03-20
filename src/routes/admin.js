import { Scopes, idSchema } from '@defra/forms-model'
import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  generateFeedbackSubmissionsFileResponseSchema,
  generateFormSubmissionsFileResponseSchema,
  getSubmissionByReferenceResponseSchema,
  magicLinkSchema,
  resetSaveAndExitLinkResponseSchema
} from '~/src/models/form.js'
import { getSubmissionRecordByReference } from '~/src/repositories/submission-repository.js'
import { resetSaveAndExitLink } from '~/src/services/save-and-exit-service.js'
import {
  generateFeedbackSubmissionsFileForAll,
  generateFeedbackSubmissionsFileForForm,
  generateFormSubmissionsFile
} from '~/src/services/submission-service.js'

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
   * @satisfies {ServerRoute<GetSubmissionByReference>}
   */
  ({
    method: 'GET',
    path: '/submission/{referenceNumber}',
    async handler(request) {
      const { params } = request
      const { referenceNumber } = params

      const record = await getSubmissionRecordByReference(referenceNumber)

      if (!record) {
        return Boom.notFound(
          `Submission record with reference ${referenceNumber} was not found`
        )
      }

      return record
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.FormRead}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            referenceNumber: Joi.string().required()
          })
          .label('getSubmissionByReferenceParams')
      },
      response: {
        status: {
          200: getSubmissionByReferenceResponseSchema
        }
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { GenerateFeedbackSubmissionsFile, GenerateFormSubmissionsFile, GetSubmissionByReference, ResetSaveAndExit } from '~/src/api/types.js'
 */
