import {
  fileAccessPayloadSchema,
  fileAccessResponseSchema,
  fileIngestPayloadSchema,
  fileIngestResponseSchema,
  filePersistPayloadSchema,
  filePersistResponseSchema,
  fileRetrievalParamsSchema,
  fileRetrievalResponseSchema
} from '~/src/models/files.js'
import {
  checkFileStatus,
  getPresignedLink,
  ingestFile,
  persistFiles
} from '~/src/services/file-service.js'

export default [
  /**
   * @satisfies {ServerRoute}
   */
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
      tags: ['api'],
      auth: false,
      validate: {
        payload: fileIngestPayloadSchema,
        /**
         * If the callback POST from CDP fails payload validation,
         * we log the errors and return 200 OK to stop them retrying
         * @param {RequestFileCreate} request
         * @param {ResponseToolkit} h
         * @param {Error} err
         */
        failAction: (request, h, err) => {
          request.logger.info('Ingestion failed, returning 200 OK', err)

          return h
            .response({ message: 'Ingestion failed' })
            .code(200)
            .takeover()
        }
      },
      response: {
        status: {
          200: fileIngestResponseSchema
        },
        sample: 0
      }
    }
  },

  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'GET',
    path: '/file/{fileId}',
    /**
     * @param {RequestFileGet} request
     */
    async handler(request) {
      const { fileId } = request.params

      const fileStatus = await checkFileStatus(fileId)

      return {
        message: 'Found',
        retrievalKeyIsCaseSensitive:
          fileStatus.retrievalKeyIsCaseSensitive ?? true
      }
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        params: fileRetrievalParamsSchema
      },
      response: {
        status: {
          200: fileRetrievalResponseSchema
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
      tags: ['api'],
      validate: {
        payload: fileAccessPayloadSchema
      },
      response: {
        status: {
          200: fileAccessResponseSchema
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
    path: '/files/persist',
    /**
     * @param {RequestFilePersist} request
     */
    async handler(request) {
      const { payload } = request
      const { files, persistedRetrievalKey } = payload

      await persistFiles(files, persistedRetrievalKey)

      return {
        message: 'Files persisted'
      }
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        payload: filePersistPayloadSchema
      },
      response: {
        status: {
          200: filePersistResponseSchema
        },
        sample: 0
      }
    }
  })
]

/**
 * @import { ResponseToolkit, ServerRoute } from '@hapi/hapi'
 * @import { RequestFileCreate, RequestFileGet, RequestFileLinkCreate, RequestFilePersist } from '~/src/api/types.js'
 */
