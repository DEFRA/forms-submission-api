import { FormStatus as FormsEnginePluginFormStatus } from '@defra/forms-engine-plugin/types'
import {
  CopyAnswersMetricName,
  FormMetricName,
  FormMetricType,
  FormStatus,
  getErrorMessage
} from '@defra/forms-model'

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
 * Validates the action within the custom metadata
 * @param { Record<string, unknown> | undefined } custom
 * @returns {{ actionName: string, referenceNumber: string } | undefined }
 */
function actionDetailsAreValid(custom) {
  const actionName = custom?.actionName
  if (!actionName) {
    return undefined
  }
  if (
    actionName === 'copy' &&
    custom.actionReferenceNumber &&
    typeof custom.actionReferenceNumber === 'string'
  ) {
    return {
      actionName: CopyAnswersMetricName.CopyAnswersSubmission,
      referenceNumber: custom.actionReferenceNumber
    }
  }
  return undefined
}

/**
 * @param {Map<string, Map<string, number>>} map
 * @param {FormAdapterSubmissionMessageMeta} meta
 */
function applyFunctionalArea(map, meta) {
  const { formId, custom } = meta
  const validDetails = actionDetailsAreValid(custom)
  if (!validDetails) {
    return
  }
  const current =
    map.get(formId) ?? /** @type {Map<string, number>} */ (new Map())
  const currentCount = current.get(validDetails.actionName) ?? 0
  current.set(validDetails.actionName, currentCount + 1)
  map.set(formId, current)
}

/**
 * @param {(FormTimelineMetric | FunctionalAreaTimelineMetric)[]} timelineMetrics
 * @param {string} formId
 * @param {FormStatus} formStatus
 * @param {number} count
 * @param {Date} date
 * @param {string} [metricName] - optional metric name, defaults to FormMetricName.Submissions
 */
function pushTimelineMetric(
  timelineMetrics,
  formId,
  formStatus,
  count,
  date,
  metricName
) {
  timelineMetrics.push(
    /** @type {FormTimelineMetric | FunctionalAreaTimelineMetric} */ ({
      type: FormMetricType.TimelineMetric,
      formId,
      formStatus,
      metricName: /** @type {string} */ (
        metricName ?? FormMetricName.Submissions
      ),
      metricValue: count,
      createdAt: date
    })
  )
}

/**
 * Generates a set of timeline metrics
 * @param {Date} date - date on which to gather the metrics for
 * @param { string | undefined } language - optional language e.g. 'cy', to restrict records to only those submitted in that language
 */
export async function generateReportTimeline(date, language) {
  logger.info(
    `[report] Generating timeline report for date ${date.toUTCString()}`
  )

  // Map flags to additional filter criteria
  const filter = language ? { 'meta.language': language } : undefined

  try {
    const submissionsCursor = getSubmissionRecordsForDate(date, filter)

    const timelineMapDraft = /** @type {Map<string, number>} */ (new Map())
    const timelineMapLive = /** @type {Map<string, number>} */ (new Map())
    const functionalAreaMapDraft =
      /** @type {Map<string, Map<string, number>>} */ (new Map())
    const functionalAreaMapLive =
      /** @type {Map<string, Map<string, number>>} */ (new Map())

    for await (const submission of submissionsCursor) {
      const { formId, isPreview, status } = submission.meta
      if (status === FormsEnginePluginFormStatus.Draft) {
        incrementFormCount(timelineMapDraft, formId)
        applyFunctionalArea(functionalAreaMapDraft, submission.meta)
      } else {
        const ignore = isPreview
        incrementFormCount(timelineMapLive, formId, ignore)
        applyFunctionalArea(functionalAreaMapLive, submission.meta)
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

    if (functionalAreaMapDraft.size) {
      for (const [formId, countMap] of functionalAreaMapDraft) {
        for (const [actionName, count] of countMap) {
          pushTimelineMetric(
            timelineMetrics,
            formId,
            FormStatus.Draft,
            count,
            date,
            actionName
          )
        }
      }
    }

    if (functionalAreaMapLive.size) {
      for (const [formId, countMap] of functionalAreaMapLive) {
        for (const [actionName, count] of countMap) {
          pushTimelineMetric(
            timelineMetrics,
            formId,
            FormStatus.Live,
            count,
            date,
            actionName
          )
        }
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
 * @import { FormTimelineMetric, FunctionalAreaTimelineMetric } from '@defra/forms-model'
 * @import { FormAdapterSubmissionMessageMeta } from '@defra/forms-engine-plugin/engine/types.js'
 */
