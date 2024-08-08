import { ingestFile } from '~/src/api/files/service.js'
import { fileIngestPayloadSchema } from '~/src/models/files.js'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/file',
    /**
     * @param {RequestFileUpload} request
     */
    async handler(request) {
      const { payload } = request

      await ingestFile(payload)

      return {
        message: 'Ingestion completed'
      }
    },
    options: {
      auth: false,
      validate: {
        payload: fileIngestPayloadSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFileUpload } from '~/src/api/types.js'
 */
