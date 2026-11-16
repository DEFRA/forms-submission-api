import { CopyAnswersMetricName, FormStatus } from '@defra/forms-model'

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

    const form1Id = 'form-id-1'
    const form2Id = 'form-id-2'
    const form3Id = 'form-id-3'
    const form4Id = 'form-id-4'

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
        new Date('2025-05-07T00:00:00.000Z'),
        undefined
      )

      expect(metrics).toEqual({
        timeline: [
          {
            type: 'timeline-metric',
            formId: 'form-id-1',
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 2,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          },
          {
            type: 'timeline-metric',
            formId: 'form-id-2',
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 4,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          },
          {
            type: 'timeline-metric',
            formId: 'form-id-4',
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 5,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          },
          {
            type: 'timeline-metric',
            formId: 'form-id-3',
            formStatus: 'live',
            metricName: 'Submissions',
            metricValue: 1,
            createdAt: new Date('2025-05-07T00:00:00.000Z')
          }
        ]
      })
    })

    it('should filter by language and count copy submissions without live previews', async () => {
      const reportDate = new Date('2025-05-07T00:00:00.000Z')
      const draftSubmissions = [
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now),
        buildCustomisedSubmissionDocument(form1Id, FormStatus.Draft, now)
      ]

      draftSubmissions[0].meta.custom = {
        actionName: 'copy',
        actionReferenceNumber: '123-ABC'
      }
      draftSubmissions[1].meta.custom = {
        actionName: 'copy',
        actionReferenceNumber: '456-DEF'
      }
      draftSubmissions[2].meta.custom = { actionName: '' }
      draftSubmissions[3].meta.custom = { actionName: 'delete' }
      draftSubmissions[4].meta.custom = { actionName: 'copy' }
      draftSubmissions[5].meta.custom = {
        actionName: 'copy',
        actionReferenceNumber: 123
      }

      const liveSubmission = buildCustomisedSubmissionDocument(
        form1Id,
        FormStatus.Live,
        now
      )
      liveSubmission.meta.custom = {
        actionName: 'copy',
        actionReferenceNumber: '789-GHI'
      }

      const livePreview = buildCustomisedSubmissionDocument(
        form1Id,
        FormStatus.Live,
        now
      )
      livePreview.meta.isPreview = true

      const submissions = [...draftSubmissions, liveSubmission, livePreview]
      const mockAsyncIterator = {
        [Symbol.asyncIterator]: function* () {
          yield* submissions
        }
      }

      jest
        .mocked(getSubmissionRecordsForDate)
        // @ts-expect-error - resolves to an async iterator like FindCursor<FormMetadataDocument>
        .mockReturnValueOnce(mockAsyncIterator)

      const metrics = await generateReportTimeline(reportDate, 'cy')

      expect(getSubmissionRecordsForDate).toHaveBeenCalledWith(reportDate, {
        'meta.language': 'cy'
      })
      expect(metrics).toEqual({
        timeline: [
          {
            type: 'timeline-metric',
            formId: form1Id,
            formStatus: 'draft',
            metricName: 'Submissions',
            metricValue: 6,
            createdAt: reportDate
          },
          {
            type: 'timeline-metric',
            formId: form1Id,
            formStatus: 'live',
            metricName: 'Submissions',
            metricValue: 1,
            createdAt: reportDate
          },
          {
            type: 'timeline-metric',
            formId: form1Id,
            formStatus: 'draft',
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            metricValue: 2,
            createdAt: reportDate
          },
          {
            type: 'timeline-metric',
            formId: form1Id,
            formStatus: 'live',
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            metricValue: 1,
            createdAt: reportDate
          }
        ]
      })
    })

    it('should handle error and still close session', async () => {
      jest.mocked(getSubmissionRecordsForDate).mockImplementationOnce(() => {
        throw new Error('report error')
      })

      await expect(() =>
        generateReportTimeline(new Date(2025, 1, 1), 'cy')
      ).rejects.toThrow('report error')
    })
  })
})
