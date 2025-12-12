import path from 'path'

import hapi from '@hapi/hapi'
import Wreck from '@hapi/wreck'
import { ProxyAgent } from 'proxy-agent'

import { config } from '~/src/config/index.js'
import { failAction } from '~/src/helpers/fail-action.js'
import { requestTracing } from '~/src/helpers/request-tracing.js'
import { prepareDb } from '~/src/mongo.js'
import { auth } from '~/src/plugins/auth/index.js'
import { forwardLogs } from '~/src/plugins/forward-logs.js'
import { logErrors } from '~/src/plugins/log-errors.js'
import { logRequests } from '~/src/plugins/log-requests.js'
import { router } from '~/src/plugins/router.js'
import { swagger } from '~/src/plugins/swagger.js'
import { prepareSecureContext } from '~/src/secure-context.js'
import { runTask as runSaveAndExitTask } from '~/src/tasks/receive-save-and-exit-messages.js'
import { runTask as runSubmissionTask } from '~/src/tasks/receive-submission-messages.js'

const isProduction = config.get('isProduction')

const proxyAgent = new ProxyAgent()

Wreck.agents = {
  https: proxyAgent,
  http: proxyAgent,
  httpsAllowUnauthorized: proxyAgent
}

/**
 * Creates the Hapi server
 */
export async function createServer() {
  const server = hapi.server({
    port: config.get('port'),
    routes: {
      response: {
        sample: 0
      },
      auth: {
        mode: 'required'
      },
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  await server.register([
    logRequests,
    requestTracing,
    auth,
    logErrors,
    forwardLogs
  ])

  if (isProduction) {
    prepareSecureContext(server)
  }

  await prepareDb(server.logger)
  await server.register(swagger)
  await server.register(router)

  await runSaveAndExitTask()
  await runSubmissionTask()

  return server
}
