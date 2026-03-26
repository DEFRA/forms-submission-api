import { Scopes } from '@defra/forms-model'
import Boom from '@hapi/boom'
import Joi from 'joi'

import { getSubmissionByReferenceResponseSchema } from '~/src/models/form.js'
import { getSubmissionRecordByReference } from '~/src/repositories/submission-repository.js'

export default [
  /**
   * @satisfies {ServerRoute<GetSubmissionByReference>}
   */
  ({
    method: 'GET',
    path: '/submission/{referenceNumber}',
    async handler(request) {
      const { params } = request
      const { referenceNumber } = params

      const record = await getSubmissionRecordByReference(referenceNumber)

      if (!record) {
        return Boom.notFound(
          `Submission record with reference ${referenceNumber} was not found`
        )
      }

      return record
    },
    options: {
      tags: ['api'],
      auth: {
        scope: [`+${Scopes.FormRead}`]
      },
      validate: {
        params: Joi.object()
          .keys({
            referenceNumber: Joi.string().required()
          })
          .label('getSubmissionByReferenceParams')
      },
      response: {
        status: {
          200: getSubmissionByReferenceResponseSchema
        }
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { GetSubmissionByReference } from '~/src/api/types.js'
 */
