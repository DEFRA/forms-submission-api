import path from 'path'

import hapi from '@hapi/hapi'
import Wreck from '@hapi/wreck'
import { ProxyAgent } from 'proxy-agent'

import { config } from '~/src/config/index.js'
import { failAction } from '~/src/helpers/fail-action.js'
import { prepareDb } from '~/src/mongo.js'
import { auth } from '~/src/plugins/auth.js'
import { logRequests } from '~/src/plugins/log-requests.js'
import { router } from '~/src/plugins/router.js'
import { prepareSecureContext } from '~/src/secure-context.js'

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

  await server.register(auth)
  await server.register(logRequests)

  if (isProduction) {
    prepareSecureContext(server)
  }

  await prepareDb(server.logger)
  await server.register(router)

  return server
}
