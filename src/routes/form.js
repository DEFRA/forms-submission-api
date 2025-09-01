import {
  formSubmitPayloadSchema,
  saveAndExitMessageData
} from '@defra/forms-model'

import { submit } from '~/src/services/file-service.js'
import {
  validateAndGetSavedState,
  validateSavedLink
} from '~/src/services/save-and-exit-service.js'

export default [
  /**
   * @satisfies {ServerRoute<{ Payload: RequestSubmit }>}
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

      return await validateSavedLink(link)
    },
    options: {
      auth: false
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Payload: RequestSubmit }>}
   */
  ({
    method: 'POST',
    path: '/save-and-exit',
    /**
     * @param {RequestSaveAndExit} request
     */
    async handler(request) {
      const { payload } = request

      const state = await validateAndGetSavedState(payload)

      return {
        message: 'Save-and-exit retrieved successfully',
        result: { state }
      }
    },
    options: {
      auth: false,
      validate: {
        payload: saveAndExitMessageData
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestSaveAndExit, RequestSubmit } from '~/src/api/types.js'
 */
