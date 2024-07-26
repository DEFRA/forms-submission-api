import routes from '~/src/routes/index.js'

/**
 * @satisfies {ServerRegisterPluginObject}
 */
export const router = {
  plugin: {
    name: 'router',
    register(server) {
      server.route(routes)
    }
  }
}

/**
 * @template {object | void} [PluginOptions=void]
 * @typedef {import('@hapi/hapi').ServerRegisterPluginObject<PluginOptions>} ServerRegisterPluginObject
 */
