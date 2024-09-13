/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/health',
  handler(request, h) {
    return h.response({ message: 'success' }).code(200)
  },
  options: {
    auth: false
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
