import { createTimer } from '~/src/helpers/timer.js'
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
import { validateRetrievalKey } from '~/src/plugins/auth/index.js'
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
          request.logger.info(err, 'Ingestion failed, returning 200 OK')

          return h
            .response({ message: 'Ingestion failed' })
            .code(200)
            .takeover()
        }
      },
      response: {
        status: {
          200: fileIngestResponseSchema
        }
      }
    }
  },

  /**
   * @satisfies {ServerRoute<{ Params: FileRetrievalParams }>}
   */
  ({
    method: 'GET',
    path: '/file/{fileId}',
    async handler(request) {
      const { fileId } = request.params

      const fileStatus = await checkFileStatus(fileId)

      return {
        message: 'Found',
        retrievalKeyIsCaseSensitive:
          fileStatus.retrievalKeyIsCaseSensitive ?? true,
        filename: fileStatus.filename
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
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Payload: FileAccessPayload }>}
   */
  ({
    method: 'POST',
    path: '/file/link',
    async handler(request) {
      const { payload, auth } = request
      const { fileId, retrievalKey } = payload
      const appCredentials =
        /** @type {{ client_id?: string } | undefined } */ (
          auth.credentials.app
        )

      // Validate retrievalKey authorization for Cognito clients
      if (appCredentials?.client_id) {
        validateRetrievalKey(appCredentials.client_id, retrievalKey)
      }

      const presignedLink = await getPresignedLink(fileId, retrievalKey)

      return {
        url: presignedLink
      }
    },
    options: {
      tags: ['api'],
      auth: {
        strategies: ['azure-oidc-token', 'cognito-access-token']
      },
      validate: {
        payload: fileAccessPayloadSchema
      },
      response: {
        status: {
          200: fileAccessResponseSchema
        }
      }
    }
  }),

  /**
   * @satisfies {ServerRoute<{ Payload: PersistedRetrievalPayload }>}
   */
  ({
    method: 'POST',
    path: '/files/persist',
    async handler(request) {
      const { payload } = request
      const { files, persistedRetrievalKey } = payload
      const persistTimer = createTimer()

      request.logger.info(
        { fileCount: files.length },
        '[filesPersistRoute:perf] Starting /files/persist request'
      )

      await persistFiles(files, persistedRetrievalKey)

      request.logger.info(
        {
          fileCount: files.length,
          durationMs: persistTimer.elapsed
        },
        '[filesPersistRoute:perf] Completed /files/persist request'
      )

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
        }
      }
    }
  })
]

/**
 * @import { ResponseToolkit, ServerRoute } from '@hapi/hapi'
 * @import { FileAccessPayload, FileRetrievalParams, PersistedRetrievalPayload, RequestFileCreate } from '~/src/api/types.js'
 */
