import { formSubmitPayloadSchema } from '@defra/forms-model'
import Joi from 'joi'

import { submit } from '~/src/services/file-service.js'
import {
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'

const validateSaveAndExitSchema = Joi.object({
  magicLinkId: Joi.string().required(),
  securityAnswer: Joi.string().required()
})

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
      auth: false,
      validate: {
        payload: formSubmitPayloadSchema
      }
    }
  }),

  /**
   * @type {ServerRoute}
   */
  ({
    method: 'GET',
    path: '/save-and-exit/{link}',
    async handler(request) {
      const { link } = request.params

      return getSavedLinkDetails(link)
    },
    options: {
      auth: false
    }
  }),

  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'POST',
    path: '/save-and-exit',
    /**
     * @param {RequestValidateSaveAndExit} request
     */
    async handler(request) {
      const { payload } = request

      const result = await validateSavedLinkCredentials(payload)

      return result
    },
    options: {
      auth: false,
      validate: {
        payload: validateSaveAndExitSchema
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestValidateSaveAndExit, RequestSubmit } from '~/src/api/types.js'
 */
