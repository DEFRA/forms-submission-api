import { ingestFile } from '../api/files/service.js'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/files',
    /**
     * @param {RequestFileUpload} request
     */
    async handler(request) {
      const { payload } = request

      await ingestFile(payload)
    },
    options: {
      auth: false
    }
  }
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { RequestFileUpload } from '~/src/api/types.js'
 */
