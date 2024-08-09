import {
  ingestFile,
  checkExists,
  getPresignedLink
} from '~/src/api/files/service.js'
import {
  fileIngestPayloadSchema,
  fileLinkCreatePayloadSchema,
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
  },
  {
    method: 'POST',
    path: '/file/link',
    /**
     * @param {RequestFileLinkCreate} request
     */
    async handler(request) {
      const { payload } = request
      const { fileId, retrievalKey } = payload

      const presignedLink = await getPresignedLink(fileId, retrievalKey)

      return {
        url: presignedLink
      }
    },
    options: {
      validate: {
        payload: fileLinkCreatePayloadSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFileCreate, RequestFileGet, RequestFileLinkCreate } from '~/src/api/types.js'
 */
