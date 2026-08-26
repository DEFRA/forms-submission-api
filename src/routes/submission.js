import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  generateReferenceNumberResponseSchema,
  getSubmissionByReferenceResponseSchema
} from '~/src/models/form.js'
import { create as createReferenceNumber } from '~/src/repositories/reference-number-repository.js'
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
        access: {
          entity: 'user',
          scope: false
        }
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
  }),
  /**
   * @satisfies {ServerRoute<GenerateReferenceNumber>}
   */
  ({
    method: 'POST',
    path: '/submission/generate-reference-number',
    handler(request) {
      const { query } = request
      const { prefix } = query

      return createReferenceNumber(prefix)
    },
    options: {
      tags: ['api'],
      auth: false,
      validate: {
        query: Joi.object()
          .keys({
            prefix: Joi.string().optional()
          })
          .label('generateReferenceNumberQuery')
      },
      response: {
        status: {
          200: generateReferenceNumberResponseSchema
        }
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { GenerateReferenceNumber, GetSubmissionByReference } from '~/src/api/types.js'
 */
