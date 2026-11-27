import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  AZURE_OIDC_TOKEN_STRATEGY,
  CITIZEN_ACCESS_TOKEN_STRATEGY
} from '~/src/constants.js'
import {
  generateReferenceNumberResponseSchema,
  getSubmissionResponseSchema
} from '~/src/models/form.js'
import { create as createReferenceNumber } from '~/src/repositories/reference-number-repository.js'
import {
  getSubmissionRecordByReference,
  getSubmissionRecordByRetrievalId
} from '~/src/repositories/submission-repository.js'

export default [
  /**
   * @satisfies {ServerRoute<GetSubmissionByReference>}
   */
  ({
    method: 'GET',
    path: '/submission/{referenceNumber}',
    async handler(request) {
      const { auth, params } = request
      const { referenceNumber } = params
      const citizenUser =
        auth.strategy === CITIZEN_ACCESS_TOKEN_STRATEGY
          ? /** @type {CitizenCredentials} */ (auth.credentials.user)
          : undefined
      const record = await getSubmissionRecordByReference(
        referenceNumber,
        citizenUser
      )

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
        strategies: [AZURE_OIDC_TOKEN_STRATEGY, CITIZEN_ACCESS_TOKEN_STRATEGY],
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
          200: getSubmissionResponseSchema
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
  }),
  /**
   * @satisfies {ServerRoute<GetSubmissionByRetrievalId>}
   */
  ({
    method: 'GET',
    path: '/submission/retrieve/{retrievalId}',
    async handler(request) {
      const { params } = request
      const { retrievalId } = params
      const record = await getSubmissionRecordByRetrievalId(retrievalId)

      if (!record) {
        return Boom.notFound(
          `Submission record with retrieval id ${retrievalId} was not found`
        )
      }

      return record
    },
    options: {
      tags: ['api'],
      auth: {
        strategy: AZURE_OIDC_TOKEN_STRATEGY,
        access: {
          entity: 'user',
          scope: false
        }
      },
      validate: {
        params: Joi.object()
          .keys({
            retrievalId: Joi.string().required()
          })
          .label('getSubmissionByRetrievalParams')
      },
      response: {
        status: {
          200: getSubmissionResponseSchema
        }
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 * @import { GenerateReferenceNumber, GetSubmissionByRetrievalId, GetSubmissionByReference } from '~/src/api/types.js'
 * @import { CitizenCredentials } from '~/src/api/types.js'
 */
