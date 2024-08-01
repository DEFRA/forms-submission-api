import { ingestFile, checkExists } from '~/src/api/files/service.js'
import {
  fileIngestPayloadSchema,
  fileRetrievalParamsSchema
} from '~/src/models/files.js'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/file',
    /**
     * @param {RequestFileCreate} request
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
    path: '/file/{fileId}',
    /**
     * @param {RequestFileGet} request
     */
    async handler(request) {
      const { fileId } = request.params

      await checkExists(fileId)

      return {
        message: 'Found'
      }
    },
    options: {
      auth: false,
      validate: {
        params: fileRetrievalParamsSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFileCreate, RequestFileGet } from '~/src/api/types.js'
 */
