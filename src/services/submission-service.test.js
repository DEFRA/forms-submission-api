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
      jest.mocked(createSubmissionXlsxFile).mockResolvedValueOnce({ fileId })

      const result = await generateSubmissionsFile(formId)

      expect(createSubmissionXlsxFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        false
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
