import { FormStatus } from '@defra/forms-engine-plugin/types'
import { StatusCodes } from 'http-status-codes'

import {
  getFormDefinition,
  getFormDefinitionVersion,
  getFormMetadata,
  getFormMetadataById
} from '~/src/services/forms-service.js'
import { getJson } from '~/src/services/httpService.js'
import * as fixtures from '~/test/fixtures/form.js'

const { MANAGER_URL } = process.env

jest.mock('~/src/services/httpService.js')

describe('Forms service', () => {
  const { definition, metadata } = fixtures

  describe('getFormMetadata', () => {
    beforeEach(() => {
      jest.mocked(getJson).mockResolvedValue({
        response: /** @type {IncomingMessage} */ ({
          statusCode: StatusCodes.OK
        }),
        body: metadata
      })
    })

    it('requests JSON via form slug', async () => {
      await getFormMetadata(metadata.slug)

      expect(getJson).toHaveBeenCalledWith(
        new URL(`/forms/slug/${metadata.slug}`, MANAGER_URL)
      )
    })

    it('coerces timestamps from string to Date', async () => {
      const body = {
        ...structuredClone(metadata),

        // JSON payload uses string dates in transit
        createdAt: metadata.createdAt.toISOString(),
        updatedAt: metadata.updatedAt.toISOString()
      }

      jest.mocked(getJson).mockResolvedValue({
        response: /** @type {IncomingMessage} */ ({
          statusCode: StatusCodes.OK
        }),
        body
      })

      await expect(getFormMetadata(metadata.slug)).resolves.toEqual({
        ...metadata,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    })
  })

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
        new URL(`/forms/${metadata.id}`, MANAGER_URL)
      )
    })

    it('coerces timestamps from string to Date', async () => {
      const body = {
        ...structuredClone(metadata),

        // JSON payload uses string dates in transit
        createdAt: metadata.createdAt.toISOString(),
        updatedAt: metadata.updatedAt.toISOString()
      }

      jest.mocked(getJson).mockResolvedValue({
        response: /** @type {IncomingMessage} */ ({
          statusCode: StatusCodes.OK
        }),
        body
      })

      await expect(getFormMetadataById(metadata.id)).resolves.toEqual({
        ...metadata,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    })
  })

  describe('getFormDefinition', () => {
    beforeEach(() => {
      jest.mocked(getJson).mockResolvedValue({
        response: /** @type {IncomingMessage} */ ({
          statusCode: StatusCodes.OK
        }),
        body: definition
      })
    })

    it('requests JSON via form ID (draft)', async () => {
      await getFormDefinition(metadata.id, FormStatus.Draft)

      expect(getJson).toHaveBeenCalledWith(
        new URL(`/forms/${metadata.id}/definition/draft`, MANAGER_URL)
      )
    })

    it('requests JSON via form ID (live)', async () => {
      await getFormDefinition(metadata.id, FormStatus.Live)

      expect(getJson).toHaveBeenCalledWith(
        new URL(
          `/forms/${metadata.id}/definition`,
          MANAGER_URL
        )
      )
    })
  })

  describe('getFormDefinitionVersion', () => {
    beforeEach(() => {
      jest.mocked(getJson).mockResolvedValue({
        response: /** @type {IncomingMessage} */ ({
          statusCode: StatusCodes.OK
        }),
        body: definition
      })
    })

    it('requests JSON via form ID (draft)', async () => {
      const versionNumber = 0
      await getFormDefinitionVersion(metadata.id, versionNumber)

      expect(getJson).toHaveBeenCalledWith(
        new URL(
          `/forms/${metadata.id}/versions/${versionNumber}/definition`,
          MANAGER_URL)
      )
    })
  })
})

/**
 * @import { IncomingMessage } from 'node:http'
 */
