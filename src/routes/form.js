import { submit } from '~/src/api/files/service.js'
import { formSubmitPayloadSchema } from '~/src/models/files.js'

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
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestSubmit } from '~/src/api/types.js'
 */
