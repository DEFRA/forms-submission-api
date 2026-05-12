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
      /** @type {'success' | 'failure'} */
      let outcome = 'success'
      /** @type {string | undefined} */
      let errorMessage

      request.logger.info(
        { fileCount: files.length },
        '[filesPersistRoute:perf] Starting /files/persist request'
      )

      try {
        await persistFiles(files, persistedRetrievalKey)

        return {
          message: 'Files persisted'
        }
      } catch (err) {
        outcome = 'failure'
        errorMessage = err instanceof Error ? err.message : 'Unknown error'

        throw err
      } finally {
        logPersistRouteCompletion(
          request,
          files.length,
          persistTimer.elapsed,
          outcome,
          errorMessage
        )
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
 * Logs completion timing for the /files/persist route.
 * @param {import('@hapi/hapi').Request<{ Payload: PersistedRetrievalPayload }>} request
 * @param {number} fileCount
 * @param {number} durationMs
 * @param {'success' | 'failure'} outcome
 * @param {string} [errorMessage]
 */
function logPersistRouteCompletion(
  request,
  fileCount,
  durationMs,
  outcome,
  errorMessage
) {
  const logData = {
    fileCount,
    durationMs,
    outcome
  }

  if (errorMessage) {
    request.logger.warn(
      {
        ...logData,
        error: errorMessage
      },
      '[filesPersistRoute:perf] Completed /files/persist request'
    )

    return
  }

  request.logger.info(
    logData,
    '[filesPersistRoute:perf] Completed /files/persist request'
  )
}

/**
 * @import { ResponseToolkit, ServerRoute } from '@hapi/hapi'
 * @import { FileAccessPayload, FileRetrievalParams, PersistedRetrievalPayload, RequestFileCreate } from '~/src/api/types.js'
 */
