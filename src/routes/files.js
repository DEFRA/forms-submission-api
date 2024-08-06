import {
  extendTtl,
  getPresignedLink,
  ingestFile
} from '~/src/api/files/service.js'
import {
  fileIngestPayloadSchema,
  fileAccessPayloadSchema
} from '~/src/models/files.js'

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
    method: 'POST',
    path: '/file-link',
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
        payload: fileAccessPayloadSchema
      }
    }
  },
  {
    method: 'POST',
    path: '/file/extend-ttl',
    /**
     * @param {RequestFileExtensionCreate} request
     */
    async handler(request) {
      const { payload } = request
      const { fileId, retrievalKey } = payload

      await extendTtl(fileId, retrievalKey)

      return {
        message: 'TTL extended'
      }
    },
    options: {
      validate: {
        payload: fileAccessPayloadSchema
      }
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFileExtensionCreate, RequestFileLinkCreate, RequestFileUpload } from '~/src/api/types.js'
 */
