import { FormMetricType, FormStatus, getErrorMessage } from '@defra/forms-model'

import { logger } from '~/src/helpers/logging/logger.js'
import { getSubmissionRecordsForDate } from '~/src/repositories/submission-repository.js'

/**
 * @param {Map<string, number>} map
 * @param {string} formId
 * @param {boolean} [ignore] - ignore live previews
 */
function incrementFormCount(map, formId, ignore = false) {
  if (ignore) {
    return
  }
  const current = map.get(formId) ?? 0
  map.set(formId, current + 1)
}

/**
 * @param {any[]} timelineMetrics
 * @param {string} formId
 * @param {FormStatus} formStatus
 * @param {number} count
 * @param {Date} date
 */
function pushTimelineMetric(timelineMetrics, formId, formStatus, count, date) {
  timelineMetrics.push(
    /** @type {FormTimelineMetric} */ ({
      type: FormMetricType.TimelineMetric,
      formId,
      formStatus,
      metricName: 'Submissions',
      metricValue: count,
      createdAt: date
    })
  )
}

/**
 * Generates a set of timeline metrics
 * @param {Date} date - date on which to gather the metrics for
 */
export async function generateReportTimeline(date) {
  logger.info(
    `[report] Generating timeline report for date ${date.toUTCString()}`
  )

  try {
    const submissionsCursor = getSubmissionRecordsForDate(date)

    const timelineMapDraft = new Map()
    const timelineMapLive = new Map()

    for await (const submission of submissionsCursor) {
      const status = submission.meta.status
      const isPreview = submission.meta.isPreview
      if (status === FormStatus.Draft) {
        incrementFormCount(timelineMapDraft, submission.meta.formId)
      } else {
        const isLivePreview = isPreview
        incrementFormCount(
          timelineMapLive,
          submission.meta.formId,
          isLivePreview
        )
      }
    }

    const timelineMetrics = /** @type {FormTimelineMetric[]} */ ([])

    if (timelineMapDraft.size) {
      for (const [formId, count] of timelineMapDraft) {
        pushTimelineMetric(
          timelineMetrics,
          formId,
          FormStatus.Draft,
          count,
          date
        )
      }
    }

    if (timelineMapLive.size) {
      for (const [formId, count] of timelineMapLive) {
        pushTimelineMetric(
          timelineMetrics,
          formId,
          FormStatus.Live,
          count,
          date
        )
      }
    }

    logger.info(
      `[report] Generated timeline report for date ${date.toString()}`
    )

    return {
      timeline: timelineMetrics
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
