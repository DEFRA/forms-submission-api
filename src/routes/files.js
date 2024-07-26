import { ingestFile } from '../api/files/service.js'

/**
 * @type {ServerRoute[]}
 */
export default [
  {
    method: 'POST',
    path: '/files/upload',
    /**
     * @param {RequestFileUpload} request
     */
    async handler(request) {
      const { payload } = request

      const fileCount = await ingestFile(payload)

      return {
        message: 'Files uploaded successfully',
        count: fileCount
      }
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
