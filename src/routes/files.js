import { getPresignedLink, ingestFile } from '~/src/api/files/service.js'
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
  },
  {
    method: 'GET',
    path: '/file/{formId}/{fileId}',
    /**
     * @param {RequestFileRetrieve} request
     */
    async handler(request) {
      const { payload } = request
      const { fileId, formId } = payload

      const presignedLink = await getPresignedLink(formId, fileId)

      return {
        url: presignedLink
      }
    },
    options: {
      auth: false
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFileRetrieve, RequestFileUpload } from '~/src/api/types.js'
 */
