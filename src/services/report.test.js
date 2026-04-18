import { FormStatus } from '@defra/forms-model'

import { buildCustomisedSubmissionDocument } from '~/src/repositories/__stubs__/submission.js'
import { getSubmissionRecordsForDate } from '~/src/repositories/submission-repository.js'
import { generateReportTimeline } from '~/src/services/report.js'

jest.mock('~/src/repositories/submission-repository.js')

jest.mock('~/src/mongo.js', () => ({
  client: {
    startSession: jest.fn()
  },
  db: {},
  SUBMISSIONS_COLLECTION_NAME: 'submissions'
}))

describe('report-timeline', () => {
  describe('generateReportTimeline', () => {
    const now = new Date()

    beforeEach(() => {
      jest.clearAllMocks()
      jest.useFakeTimers().setSystemTime(now)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    const form1Id = '449a699bcc9946a6a6d925de'
    const form2Id = '0dae1c832b8e4a89963a7825'
    const form3Id = '9fb48bd350a64e908c9ea92e'
    const form4Id = '9fb48bd350a64e908c9ea92e'

    it('should gather metrics for all forms, for a specific date', async () => {
      const allSubmissions = [
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form2Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form4Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form2Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form4Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form2Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form4Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form2Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form4Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form4Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form3Id, FormStatus.Live, now)
      ]

      const mockAsyncIterator = {
        [Symbol.asyncIterator]: function* () {
          for (const submission of allSubmissions) {
            yield submission
          }
        }
      }

      jest
        .mocked(getSubmissionRecordsForDate)
        // @ts-expect-error - resolves to an async iterator like FindCursor<FormMetadataDocument>
        .mockReturnValueOnce(mockAsyncIterator)

      const metrics = await generateReportTimeline(
        new Date('2025-05-07T00:00:00.000Z')
      )

      expect(metrics).toEqual({
        timelineDraft: [
          {
            type: 'timeline-metric',
            formId: '449a699bcc9946a6a6d925de',
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 2,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          },
          {
            type: 'timeline-metric',
            formId: '0dae1c832b8e4a89963a7825',
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 4,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          },
          {
            type: 'timeline-metric',
            formId: '9fb48bd350a64e908c9ea92e',
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 5,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          }
        ],
        timelineLive: [
          {
            type: 'timeline-metric',
            formId: '9fb48bd350a64e908c9ea92e',
            formStatus: 'live',
            metricName: 'Submissions',
            metricValue: 1,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          }
        ]
      })
    })

    it('should handle error and still close session', async () => {
      jest.mocked(getSubmissionRecordsForDate).mockImplementationOnce(() => {
        throw new Error('report error')
      })

      await expect(() =>
        generateReportTimeline(new Date(2025, 1, 1))
      ).rejects.toThrow('report error')
    })
  })
})
