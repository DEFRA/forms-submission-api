import xlsx from 'xlsx'

import { getSubmissionRecords } from '~/src/repositories/submission-repository.js'
import {
  getFormDefinitionVersion,
  getFormMetadataById
} from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'
import { createSubmissionXlsxFile } from '~/src/services/service-helpers.js'
import { generateSubmissionsFile } from '~/src/services/submission-service.js'
// @ts-expect-error - import json
import formSubmissions from '~/test/fixtures/forms-submissions.json'
// @ts-expect-error - import json
import formVersions from '~/test/fixtures/forms-versions.json'

jest.mock('~/src/repositories/submission-repository.js')
jest.mock('~/src/services/forms-service.js')
jest.mock('~/src/services/service-helpers.js')
jest.mock('~/src/services/notify.js')

describe('Submission service', () => {
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

      const result = await generateSubmissionsFile(formId)

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
549-FBF-C88,2025-11-13T17:17:29.426Z,Chocolate,,,,,,,,,,,,,,,
187-231-E68,2025-11-27T08:34:46.620Z,Chocolate,enrique.chase@defra.gov.uk,A,12345,"House name, Forest Hill, Village, Town, M15 5TX","A, C",,,,,,,,,,d@s.com
259-0B2-442,2025-11-28T00:18:16.739Z,Chocolate,enrique.chase@defra.gov.uk,B,123456789,"House name, Forest Hill, Village, Town, M15 5TX",A,Cheese,2,Ham,6,,,,,,d@s.com
F6C-807-B1F,2025-11-28T10:56:18.903Z,Kinder,kinder@egg.com,D,123,"Prime Minister & First Lord Of The Treasury 10, Downing Street, London, SW1A 2AA","A, B, C",Ham,2,Cheese,1,Hawaian,12,,,,d@s.com
D44-841-706,2025-11-28T16:49:10.659Z,Chocolate,kinder@egg.com,A,12345,"House name, Forest Hill, Village, Town, M15 5TX","A, B",Egg,1,Ham,2,Bacon,4,,,1,
8CC-882-665,2025-11-28T17:31:48.731Z,Chocolate,kinder@egg.com,A,123456789,"House name, Forest Hill, Village, Town, M15 5TX","A, C",Cheese,2,Hawaian,12,Cheese,6,,,1,
450-904-A2C,2025-12-01T15:02:08.103Z,Chocolate,enrique.chase@defra.gov.uk,D,+447930696579,"Prime Minister & First Lord Of The Treasury 10, Downing Street, London, SW1A 2AA","A, C",Ham,2,Pineapple,1,Bacon,5,Cheese,3,1,
8C2-7E8-189,2025-12-02T11:24:38.324Z,Chocolate,kinder@egg.com,E,12345,"Orchards, Forest Hill, Village, Town, M15 5TX","A, C",Egg,9,,,,,,,1,`
      )

      expect(sendNotification).toHaveBeenCalledWith({
        emailAddress: 'enrique.chase@defra.gov.uk',
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
})

/**
 * @import { FormDefinition, FormMetadata } from '@defra/forms-model'
 */
