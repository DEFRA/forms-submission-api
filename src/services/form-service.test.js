import { StatusCodes } from 'http-status-codes'

import { getFormMetadataById } from '~/src/services/form-service.js'
import { getJson } from '~/src/services/httpService.js'

const { MANAGER_URL } = process.env

jest.mock('~/src/services/httpService')

const now = new Date()

/**
 * @satisfies {FormMetadataAuthor}
 */
const author = {
  id: 'J6PlucvwkmNlYxX9HnSEj27AcJAVx_08IvZ-IPNTvAN',
  displayName: 'Enrique Chase'
}

/**
 * @satisfies {FormMetadata}
 */
const metadata = {
  id: '661e4ca5039739ef2902b214',
  slug: 'test-form',
  title: 'Test form',
  organisation: 'Defra',
  teamName: 'Defra Forms',
  teamEmail: 'defraforms@defra.gov.uk',
  createdAt: now,
  createdBy: author,
  updatedAt: now,
  updatedBy: author
}

describe('Forms service', () => {
  describe('getFormMetadataById', () => {
    beforeEach(() => {
      jest.mocked(getJson).mockResolvedValue({
        response: /** @type {IncomingMessage} */ ({
          statusCode: StatusCodes.OK
        }),
        body: metadata
      })
    })

    it('requests JSON via form slug', async () => {
      await getFormMetadataById(metadata.id)

      expect(getJson).toHaveBeenCalledWith(
        new URL(`${MANAGER_URL}/forms/${metadata.id}`)
      )
    })
  })
})

/**
 * @import { IncomingMessage } from 'node:http'
 * @import { FormMetadata, FormMetadataAuthor } from '@defra/forms-model'
 */
