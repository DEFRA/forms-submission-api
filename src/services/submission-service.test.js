import { ComponentType } from '@defra/forms-model'
import xlsx from 'xlsx'

import { getSubmissionRecords } from '~/src/repositories/submission-repository.js'
import {
  getFormDefinitionVersion,
  getFormMetadataById
} from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'
import { createSubmissionXlsxFile } from '~/src/services/service-helpers.js'
import {
  coerceDataValue,
  generateFeedbackSubmissionsFile,
  generateFormSubmissionsFile
} from '~/src/services/submission-service.js'
// @ts-expect-error - import json
import feedbackSubmissions from '~/test/fixtures/feedback-submissions.json'
import { formFeedbackVersions } from '~/test/fixtures/forms-feedback-versions.js'
// @ts-expect-error - import json
import formSubmissions from '~/test/fixtures/forms-submissions.json'
// @ts-expect-error - import json
import formVersions from '~/test/fixtures/forms-versions.json'

jest.mock('~/src/repositories/submission-repository.js')
jest.mock('~/src/services/forms-service.js')
jest.mock('~/src/services/service-helpers.js')
jest.mock('~/src/services/notify.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  })
}))

describe('Submission service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateSubmissionsFile', () => {
    test('should generate submission file if all valid', async () => {
      const formId = '688131eeff67f889d52c66cc'
      const fileId = 'fc2f96e0-ed20-4e31-81a4-5a4a841aa9a5'
      jest.mocked(getFormMetadataById).mockResolvedValueOnce(
        /** @type {FormMetadata}  */ ({
          title: 'My form',
          notificationEmail: 'enrique.chase@defra.gov.uk'
        })
      )

      const mockAsyncIterator = {
        [Symbol.asyncIterator]: function* () {
          for (const submission of formSubmissions) {
            yield submission
          }
        }
      }

      // @ts-expect-error - resolves to an async iterator like FindCursor<FormSubmissionDocument>
      jest.mocked(getSubmissionRecords).mockReturnValueOnce(mockAsyncIterator)

      jest
        .mocked(getFormDefinitionVersion)
        .mockImplementation((id, versionNumber) => {
          const versions = /** @type {Record<string, FormDefinition>} */ (
            /** @type {unknown} */ (formVersions)
          )

          if (!versionNumber) {
            throw new Error('Expected a version number')
          }

          const version = versions[versionNumber.toString()]

          return Promise.resolve(version)
        })

      const mockCreate = jest
        .mocked(createSubmissionXlsxFile)
        .mockResolvedValueOnce({ fileId })

      const result = await generateFormSubmissionsFile(formId)

      expect(createSubmissionXlsxFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        false
      )
      const buffer = mockCreate.mock.calls[0][0]
      const workbook = xlsx.read(buffer, { type: 'buffer' })

      expect(workbook.Sheets.Sheet1).toBeDefined()

      const sheetAsCsv = xlsx.utils.sheet_to_csv(workbook.Sheets.Sheet1)

      expect(sheetAsCsv).toBe(
        `Submission reference number,Submission date,Easter egg,Your email,Country,Phone number,Delivery address,Fave color,Pizza flavour 1,Quantity 1,Pizza flavour 2,Quantity 2,Pizza flavour 3,Quantity 3,Pizza flavour 4,Quantity 4,Files,Your email
549-FBF-C88,13/11/2025,Chocolate,,,,,,,,,,,,,,,
187-231-E68,27/11/2025,Chocolate,enrique.chase@defra.gov.uk,A,12345,"House name, Forest Hill, Village, Town, M15 5TX","A, C",,,,,,,,,,d@s.com
259-0B2-442,28/11/2025,Chocolate,enrique.chase@defra.gov.uk,B,123456789,"House name, Forest Hill, Village, Town, M15 5TX",A,Cheese,2,Ham,6,,,,,,d@s.com
F6C-807-B1F,28/11/2025,Kinder,kinder@egg.com,D,123,"Prime Minister & First Lord Of The Treasury 10, Downing Street, London, SW1A 2AA","A, B, C",Ham,2,Cheese,1,Hawaian,12,,,,d@s.com
D44-841-706,28/11/2025,Chocolate,kinder@egg.com,A,12345,"House name, Forest Hill, Village, Town, M15 5TX","A, B",Egg,1,Ham,2,Bacon,4,,,http://localhost:3000/file-download/4444ac6f-7a5c-4bb8-bbd8-459c3700a42e,
8CC-882-665,28/11/2025,Chocolate,kinder@egg.com,A,123456789,"House name, Forest Hill, Village, Town, M15 5TX","A, C",Cheese,2,Hawaian,12,Cheese,6,,,http://localhost:3000/file-download/99d51a43-8121-4368-8b52-1ae93ebb9b61,
450-904-A2C,01/12/2025,Chocolate,enrique.chase@defra.gov.uk,D,+447930696579,"Prime Minister & First Lord Of The Treasury 10, Downing Street, London, SW1A 2AA","A, C",Ham,2,Pineapple,1,Bacon,5,Cheese,3,http://localhost:3000/file-download/207a6520-f311-4862-9d46-360d14918b4f,
8C2-7E8-189,02/12/2025,Chocolate,kinder@egg.com,E,12345,"Orchards, Forest Hill, Village, Town, M15 5TX","A, C",Egg,9,,,,,,,http://localhost:3000/file-download/e0f661ac-e9be-44ed-a156-e9128a89ce47,`
      )

      expect(sendNotification).toHaveBeenCalledWith({
        emailAddress: 'name@example.gov.uk',
        templateId: 'dummy',
        personalisation: {
          subject: 'File is ready to download - My form',
          body: "The file you requested for 'My form' is ready to download.\n\n  [Download file](http://localhost:3000/file-download/fc2f96e0-ed20-4e31-81a4-5a4a841aa9a5)\n\n  ^ The link will expire in 90 days.\n\n  From the Defra Forms team.\n  "
        },
        emailReplyToId: 'dummy'
      })

      expect(result).toEqual({ fileId })
    })
  })

  describe('generateFeedbackSubmissionsFile', () => {
    test('should generate feedback submission file for a single formId', async () => {
      const formId = '4670365d-5e5a-44aa-99bb-a58c16ba2e9c'
      const fileId = 'f4e249f9-6116-4bb6-8b21-8c6e17f074cd'
      jest.mocked(getFormMetadataById).mockResolvedValueOnce(
        /** @type {FormMetadata}  */ ({
          title: 'Feedback form',
          notificationEmail: 'not-used@defra.gov.uk'
        })
      )

      const mockAsyncIterator = {
        [Symbol.asyncIterator]: function* () {
          for (const submission of feedbackSubmissions) {
            yield submission
          }
        }
      }

      // @ts-expect-error - resolves to an async iterator like FindCursor<FormSubmissionDocument>
      jest.mocked(getSubmissionRecords).mockReturnValueOnce(mockAsyncIterator)

      jest
        .mocked(getFormDefinitionVersion)
        .mockImplementation((id, versionNumber) => {
          const versions = /** @type {Record<string, FormDefinition>} */ (
            /** @type {unknown} */ (formFeedbackVersions)
          )

          if (!versionNumber) {
            throw new Error('Expected a version number')
          }

          const version = versions[versionNumber.toString()]

          return Promise.resolve(version)
        })

      const mockCreate = jest
        .mocked(createSubmissionXlsxFile)
        .mockResolvedValueOnce({ fileId })

      const result = await generateFeedbackSubmissionsFile(formId)

      expect(createSubmissionXlsxFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        false
      )
      const buffer = mockCreate.mock.calls[0][0]
      const workbook = xlsx.read(buffer, { type: 'buffer' })

      expect(workbook.Sheets.Sheet1).toBeDefined()

      const sheetAsCsv = xlsx.utils.sheet_to_csv(workbook.Sheets.Sheet1)

      expect(sheetAsCsv).toBe(
        `Submission date,Form name,How you feel about the service,How we could improve this service
28/11/2025,Feedback form,Very satisfied,
28/11/2025,Feedback form,Very satisfied,
01/12/2025,Feedback form,Satisfied,
02/12/2025,Feedback form,Very satisfied,`
      )

      expect(sendNotification).toHaveBeenCalledWith({
        emailAddress: 'name@example.gov.uk',
        templateId: 'dummy',
        personalisation: {
          subject: 'File is ready to download - My form',
          body: "The file you requested for 'My form' is ready to download.\n\n  [Download file](http://localhost:3000/file-download/f4e249f9-6116-4bb6-8b21-8c6e17f074cd)\n\n  ^ The link will expire in 90 days.\n\n  From the Defra Forms team.\n  "
        },
        emailReplyToId: 'dummy'
      })

      expect(result).toEqual({ fileId })
    })

    test('should generate feedback submissions file for all forms', async () => {
      const fileId = 'f4e249f9-6116-4bb6-8b21-8c6e17f074cd'
      jest.mocked(getFormMetadataById).mockResolvedValueOnce(
        /** @type {FormMetadata}  */ ({
          title: 'Example form',
          notificationEmail: 'not-used@defra.gov.uk'
        })
      )

      const mockAsyncIterator = {
        [Symbol.asyncIterator]: function* () {
          for (const submission of feedbackSubmissions) {
            yield submission
          }
        }
      }

      // @ts-expect-error - resolves to an async iterator like FindCursor<FormSubmissionDocument>
      jest.mocked(getSubmissionRecords).mockReturnValueOnce(mockAsyncIterator)

      jest
        .mocked(getFormDefinitionVersion)
        .mockImplementation((id, versionNumber) => {
          const versions = /** @type {Record<string, FormDefinition>} */ (
            /** @type {unknown} */ (formFeedbackVersions)
          )

          if (!versionNumber) {
            throw new Error('Expected a version number')
          }

          const version = versions[versionNumber.toString()]

          return Promise.resolve(version)
        })

      const mockCreate = jest
        .mocked(createSubmissionXlsxFile)
        .mockResolvedValueOnce({ fileId })

      const result = await generateFeedbackSubmissionsFile()

      expect(createSubmissionXlsxFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        false
      )
      const buffer = mockCreate.mock.calls[0][0]
      const workbook = xlsx.read(buffer, { type: 'buffer' })

      expect(workbook.Sheets.Sheet1).toBeDefined()

      const sheetAsCsv = xlsx.utils.sheet_to_csv(workbook.Sheets.Sheet1)

      expect(sheetAsCsv).toBe(
        `Submission date,Form name,How you feel about the service,How we could improve this service
28/11/2025,Example form,Very satisfied,
28/11/2025,Example form,Very satisfied,
01/12/2025,Example form,Satisfied,
02/12/2025,Example form,Very satisfied,`
      )

      expect(sendNotification).toHaveBeenCalledWith({
        emailAddress: 'name@example.gov.uk',
        templateId: 'dummy',
        personalisation: {
          subject: 'File is ready to download - My form',
          body: "The file you requested for 'My form' is ready to download.\n\n  [Download file](http://localhost:3000/file-download/f4e249f9-6116-4bb6-8b21-8c6e17f074cd)\n\n  ^ The link will expire in 90 days.\n\n  From the Defra Forms team.\n  "
        },
        emailReplyToId: 'dummy'
      })

      expect(result).toEqual({ fileId })
    })
  })

  describe('coerceDataValue', () => {
    test('should return undefined', () => {
      expect(
        coerceDataValue(undefined, { type: ComponentType.TextField })
      ).toBeUndefined()
    })
    test('should return a date', () => {
      const expectedDate = new Date(2000, 0, 1)
      const res = coerceDataValue('01/01/2000', {
        type: ComponentType.DatePartsField
      })
      expect(res).toBeInstanceOf(Date)
      expect(res).toEqual(expectedDate)
    })
    test('should return a number', () => {
      const expectedNumber = 123.456
      const res = coerceDataValue('123.456', {
        type: ComponentType.NumberField
      })
      expect(typeof res).toBe('number')
      expect(res).toEqual(expectedNumber)
    })
    test('should return a string', () => {
      const expectedString = 'Some text'
      const res = coerceDataValue('Some text', {
        type: ComponentType.MultilineTextField
      })
      expect(typeof res).toBe('string')
      expect(res).toEqual(expectedString)
    })
  })
})

/**
 * @import { FormDefinition, FormMetadata } from '@defra/forms-model'
 */
