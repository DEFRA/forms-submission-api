import { FormMetricType, FormStatus, getErrorMessage } from '@defra/forms-model'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { getSubmissionRecordsForDate } from '~/src/repositories/submission-repository.js'

const logger = createLogger()

/**
 * @param {Map<string, number>} map
 * @param {string} formId
 */
export function incrementFormCount(map, formId) {
  const current = map.get(formId)
  if (current === undefined) {
    map.set(formId, 1)
  } else {
    map.set(formId, current + 1)
  }
}

/**
 * Generates a set of timeline metrics
 * @param {Date} date - date on which to gather the metrics for
 */
export async function generateReportTimeline(date) {
  logger.info(`Generating timeline report for date ${date.toString()}`)

  try {
    const submissionsCursor = getSubmissionRecordsForDate(date)

    const timelineMapDraft = new Map()
    const timelineMapLive = new Map()

    for await (const submission of submissionsCursor) {
      const status = submission.meta.status
      if (status === FormStatus.Draft) {
        incrementFormCount(timelineMapDraft, submission.meta.formId)
      } else {
        incrementFormCount(timelineMapLive, submission.meta.formId)
      }
    }

    const timelineMetricsDraft = []
    const timelineMetricsLive = []

    if (timelineMapDraft.size) {
      for (const [formId, count] of timelineMapDraft) {
        timelineMetricsDraft.push(
          /** @type {FormTimelineMetric} */ ({
            type: FormMetricType.TimelineMetric,
            formId,
            formStatus: FormStatus.Draft,
            metricName: 'Submissions',
            metricValue: count,
            createdAt: date
          })
        )
      }
    }

    if (timelineMapLive.size) {
      for (const [formId, count] of timelineMapLive) {
        timelineMetricsLive.push(
          /** @type {FormTimelineMetric} */ ({
            type: FormMetricType.TimelineMetric,
            formId,
            formStatus: FormStatus.Live,
            metricName: 'Submissions',
            metricValue: count,
            createdAt: date
          })
        )
      }
    }

    logger.info(`Generated timeline report for date ${date.toString()}`)

    return {
      timelineDraft: timelineMetricsDraft,
      timelineLive: timelineMetricsLive
    }
  } catch (err) {
    logger.error(
      err,
      `[report] Failed to generate timeline report for date ${date.toString()} - ${getErrorMessage(err)}`
    )

    throw err
  }
}

/**
 * @import { FormTimelineMetric } from '@defra/forms-model'
 */
