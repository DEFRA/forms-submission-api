import { formSubmitPayloadSchema } from '@defra/forms-model'
import Joi from 'joi'

import { CITIZEN_ACCESS_TOKEN_STRATEGY } from '~/src/constants.js'
import {
  deleteSavedLinkResponseSchema,
  formSubmitResponseSchema,
  generateReportTimelineResponseSchema,
  getSaveAndExitRecordResponseSchema,
  getSaveAndExitRecordsResponseSchema,
  getSavedLinkGoneSchema,
  getSavedLinkResponseSchema,
  magicLinkSchema,
  previewSchema,
  validateSavedLinkResponseSchema
} from '~/src/models/form.js'
import { submit } from '~/src/services/file-service.js'
import { generateReportTimeline } from '~/src/services/report.js'
import {
  deleteSavedLinkDetails,
  getSaveAndExitRecordForUser,
  getSaveAndExitRecordsForUser,
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'

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
   * @type {ServerRoute<GetSaveAndExitRecordsRequest>}
   */
  ({
    method: 'GET',
    path: '/save-and-exit/records',
    handler(request) {
      const { sub, iss } = request.auth.credentials.user
      const { formId, preview } = request.query

      return getSaveAndExitRecordsForUser(sub, iss, formId, preview)
    },
    options: {
      tags: ['api'],
      // The token names the citizen, so the request carries no identifier.
      auth: CITIZEN_ACCESS_TOKEN_STRATEGY,
      validate: {
        query: Joi.object()
          .keys({
            formId: Joi.string().required(),
            preview: previewSchema
          })
          .label('getSaveAndExitRecordsQuery')
      },
      response: {
        status: {
          200: getSaveAndExitRecordsResponseSchema
        }
      }
    }
  }),

  /**
   * @type {ServerRoute<GetSaveAndExitRecordRequest>}
   */
  ({
    method: 'GET',
    path: '/save-and-exit/records/{link}',
    handler(request) {
      const { sub, iss } = request.auth.credentials.user
      const { link } = request.params

      return getSaveAndExitRecordForUser(sub, iss, link)
    },
    options: {
      tags: ['api'],
      // The token names the citizen, so the request carries no identifier.
      auth: 'citizen-access-token',
      validate: {
        params: Joi.object()
          .keys({
            link: magicLinkSchema
          })
          .label('getSaveAndExitRecordParams')
      },
      response: {
        status: {
          200: getSaveAndExitRecordResponseSchema
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
          200: getSavedLinkResponseSchema,
          410: getSavedLinkGoneSchema
        }
      }
    }
  }),

  /**
   * @type {ServerRoute<{ Params: DeleteSavedLinkParams }>}
   */
  ({
    method: 'DELETE',
    path: '/save-and-exit/records/{link}',
    async handler(request) {
      const { link } = request.params

      return deleteSavedLinkDetails(link)
    },
    options: {
      tags: ['api'],
      auth: 'citizen-access-token',
      validate: {
        params: Joi.object()
          .keys({
            link: magicLinkSchema
          })
          .label('deleteSavedLinkParams')
      },
      response: {
        status: {
          200: deleteSavedLinkResponseSchema
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
   * @type {ServerRoute<GetReportTimelineRequest>}
   */
  ({
    method: 'GET',
    path: '/report/timeline',
    handler(request) {
      const { date, language } = request.query

      return generateReportTimeline(date, language)
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        query: Joi.object()
          .keys({
            date: Joi.date().required(),
            language: Joi.string().allow('cy').optional()
          })
          .label('getReportTimelineQuery')
      },
      response: {
        status: {
          200: generateReportTimelineResponseSchema
        }
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { SubmitPayload } from '@defra/forms-model'
 * @import { GetSavedLinkParams, GetReportTimelineRequest, GetSaveAndExitRecordRequest, GetSaveAndExitRecordsRequest, ValidateSaveAndExit, DeleteSavedLinkParams } from '~/src/api/types.js'
 */
