import { formSubmitPayloadSchema } from '@defra/forms-model'
import Joi from 'joi'

import {
  formSubmitResponseSchema,
  getSavedLinkResponseSchema,
  magicLinkSchema,
  validateSavedLinkResponseSchema
} from '~/src/models/form.js'
import { submit } from '~/src/services/file-service.js'
import {
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'

export default [
  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'POST',
    path: '/submit',
    /**
     * @param {RequestSubmit} request
     */
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
        },
        sample: 0
      }
    }
  }),

  /**
   * @type {ServerRoute}
   */
  ({
    method: 'GET',
    path: '/save-and-exit/{link}',
    /**
     * @param {RequestLinkGet} request
     */
    async handler(request) {
      const { link } = request.params

      return getSavedLinkDetails(link)
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        params: Joi.object().keys({
          link: magicLinkSchema
        })
      },
      response: {
        status: {
          200: getSavedLinkResponseSchema
        },
        sample: 0
      }
    }
  }),

  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'POST',
    path: '/save-and-exit/{link}',
    /**
     * @param {RequestValidateSaveAndExit} request
     */
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
        params: Joi.object().keys({
          link: magicLinkSchema
        }),
        payload: Joi.object({
          securityAnswer: Joi.string().required()
        })
      },
      response: {
        status: {
          200: validateSavedLinkResponseSchema
        },
        sample: 0
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestValidateSaveAndExit, RequestSubmit, RequestLinkGet } from '~/src/api/types.js'
 */
