import { formSubmitPayloadSchema } from '@defra/forms-model'
import Boom from '@hapi/boom'
import Joi from 'joi'

import { CITIZEN_ACCESS_TOKEN_STRATEGY } from '~/src/constants.js'
import {
  deleteSavedLinkResponseSchema,
  formSubmitResponseSchema,
  generateReportTimelineResponseSchema,
  getFormRecordsResponseSchema,
  getSaveAndExitRecordResponseSchema,
  getSaveAndExitRecordsResponseSchema,
  getSavedLinkGoneSchema,
  getSavedLinkResponseSchema,
  linkSubmissionsResponseSchema,
  magicLinkSchema,
  previewSchema,
  validateSavedLinkResponseSchema
} from '~/src/models/form.js'
import { submit } from '~/src/services/file-service.js'
import {
  getFormRecordsForUser,
  linkSubmissionsToUser
} from '~/src/services/form-records-service.js'
import { generateReportTimeline } from '~/src/services/report.js'
import {
  getSaveAndExitRecordForUser,
  getSaveAndExitRecordsForUser,
  getSavedLinkDetails,
  markSavedLinkDetailsAsDeleted,
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
   * @type {ServerRoute<DeleteSaveAndExitRecordRequest>}
   */
  ({
    method: 'DELETE',
    path: '/save-and-exit/records/{link}',
    async handler(request) {
      const { auth, params } = request
      const { link } = params
      const { sub, iss } = auth.credentials.user

      return markSavedLinkDetailsAsDeleted(sub, iss, link)
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
   * @type {ServerRoute<GetFormRecordsRequest>}
   */
  ({
    method: 'GET',
    path: '/form/records',
    handler(request) {
      const { auth } = request
      const { sub, iss } = auth.credentials.user

      const { formId, preview } = request.query

      return getFormRecordsForUser(sub, iss, formId, preview)
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
          .label('getFormRecordsQuery')
      },
      response: {
        status: {
          200: getFormRecordsResponseSchema
        }
      }
    }
  }),

  /**
   * Links a citizen's earlier submissions of a form to their account.
   *
   * Finds the submissions of the given form whose confirmation email matches
   * the email claim in the citizen's access token (case-insensitive) and that
   * are not yet linked to an account, then records the token's subject and
   * issuer against them. Submissions already linked to an account are left
   * unchanged, so calling it again is safe.
   *
   * Only forms listed in `submissionLinking.allowedForms` can be linked; other
   * forms return 403, as does a token without an email claim. The response
   * gives the number of submissions linked by this call.
   * @type {ServerRoute<LinkSubmissionsRequest>}
   */
  ({
    method: 'POST',
    path: '/form/submissions/link',
    handler(request) {
      const { auth, payload } = request
      const { sub, iss, email } = auth.credentials.user
      const { formId } = payload

      // The email comes from the token, so a caller cannot name another
      // person's email
      if (!email) {
        throw Boom.forbidden('The access token has no email claim')
      }

      return linkSubmissionsToUser(sub, iss, formId, email)
    },
    options: {
      tags: ['api'],
      // The token names the citizen and their email, so the request carries
      // neither
      auth: CITIZEN_ACCESS_TOKEN_STRATEGY,
      validate: {
        payload: Joi.object()
          .keys({
            formId: Joi.string().required()
          })
          .label('linkSubmissionsPayload')
      },
      response: {
        status: {
          200: linkSubmissionsResponseSchema
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
 * @import { GetFormRecordsRequest, LinkSubmissionsRequest, GetSavedLinkParams, GetReportTimelineRequest, GetSaveAndExitRecordRequest, GetSaveAndExitRecordsRequest, ValidateSaveAndExit, DeleteSaveAndExitRecordRequest } from '~/src/api/types.js'
 */
