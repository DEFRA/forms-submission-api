import routes from '~/src/routes/index.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const router = {
  plugin: {
    name: 'router',
    register(server) {
      server.route(/** @type {ServerRoute[]} */ (routes))
    }
  }
}

/**
 * @import { ServerRegisterPluginObject, ServerRoute } from '@hapi/hapi'
 */
