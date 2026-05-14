import { getErrorMessage } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { requireConfig } from '~/src/config/require-config.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { createTimer } from '~/src/helpers/timer.js'
import {
  findExpiringRecords,
  lockRecordForExpiryEmail,
  markExpiryEmailSent,
  saveAndExitLabel
} from '~/src/repositories/save-and-exit-repository.js'
import { getFormMetadataById } from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'

const minimumHoursRemaining = config.get(
  'emailUsersExpiringSoonSavedForLaterLink.minimumHoursRemaining'
)
/**
 *
 * @returns Record<string,string>
 */
function getNotifyEmailConfig() {
  return {
    templateId: requireConfig(
      config.get('notifyTemplateId'),
      'notifyTemplateId'
    ),
    emailReplyToId: requireConfig(
      config.get('notifyReplyToId'),
      'notifyReplyToId'
    )
  }
}

/**
 * @param {WithId<SaveAndExitDocument>} record
 * @param {Map<string, FormMetadata | null>} formMetadataCache
 * @returns {Promise<FormMetadata | null>}
 */
async function getFormMetadataForRecord(record, formMetadataCache) {
  const cached = formMetadataCache.get(record.form.id)
  if (cached !== undefined) {
    return cached
  }

  try {
    const timer = createTimer()
    const metadata = await getFormMetadataById(record.form.id)
    formMetadataCache.set(record.form.id, metadata)
    logger.info(
      {
        event: {
          category: saveAndExitLabel,
          action: 'fetch-form-metadata',
          reference: record.magicLinkId,
          duration: timer.elapsed
        }
      },
      `[SAER] Fetched form metadata for ${record.form.id} (${timer.elapsed}ms)`
    )
    return metadata
  } catch (err) {
    logger.warn(
      {
        err,
        event: {
          category: saveAndExitLabel,
          action: 'fetch-form-metadata-failed',
          reference: record.magicLinkId
        }
      },
      `[SAER] Failed to fetch form metadata for ${record.form.id} — using fallback title`
    )
    formMetadataCache.set(record.form.id, null)
    return null
  }
}

/**
 * Constructs email content for expiry reminder
 * @param {WithId<SaveAndExitDocument>} document
 * @param {string} formTitle
 * @returns {SendNotificationArgs}
 */
export function constructExpiryReminderEmailContent(document, formTitle) {
  const { templateId, emailReplyToId } = getNotifyEmailConfig()

  // Calculate hours remaining until expiry (rounded down)
  const now = new Date()
  const timeRemainingMs = document.expireAt.getTime() - now.getTime()
  const hoursRemaining = Math.floor(timeRemainingMs / (1000 * 60 * 60))
  const hoursRemainingText =
    hoursRemaining === 1 ? `${hoursRemaining} hour` : `${hoursRemaining} hours`

  const emailSubject = `Form progress expires in ${hoursRemainingText}`

  const emailBody = `# Form progress expires soon

Your progress with ${formTitle} expires in ${hoursRemainingText}.

[Continue with your form](${document.form.baseUrl}/resume-form/${document.form.id}/${document.magicLinkId})

The link is valid for ${hoursRemainingText}. After that time, your saved information will be deleted.
`

  return {
    emailAddress: document.email,
    templateId,
    personalisation: {
      subject: emailSubject,
      body: emailBody
    },
    emailReplyToId
  }
}

/**
 * Process a single expiring record: lock, send email, mark as sent
 * @param {Awaited<ReturnType<typeof findExpiringRecords>>[number]} record
 * @param {string} runtimeId
 * @param {Map<string, FormMetadata | null>} formMetadataCache
 * @returns {Promise<'processed' | 'skipped' | 'failed'>}
 */
async function processExpiringRecord(record, runtimeId, formMetadataCache) {
  try {
    const lockedRecord = await lockRecordForExpiryEmail(
      record.magicLinkId,
      runtimeId,
      record.version
    )

    if (!lockedRecord) {
      logger.info(
        {
          event: {
            category: saveAndExitLabel,
            action: 'skip-lock-failed',
            reference: record.magicLinkId
          }
        },
        `[SAER] Skipping ${record.magicLinkId} - failed to obtain lock`
      )
      return 'skipped'
    }

    if (lockedRecord.notify?.expireLockId !== runtimeId) {
      logger.warn(
        {
          event: {
            category: saveAndExitLabel,
            action: 'lock-verification-failed',
            reference: record.magicLinkId
          }
        },
        `[SAER] Lock verification failed for ${record.magicLinkId} - lock ID mismatch`
      )
      return 'skipped'
    }

    const metadata = await getFormMetadataForRecord(
      lockedRecord,
      formMetadataCache
    )

    // Fail-open: if forms-manager is unreachable, metadata is null and we
    // proceed to send the reminder. The runtime renders the unavailable view
    // when the user clicks through, so the worst case is a user discovering
    // the form is offline on click rather than not getting an email. The
    // alternative (fail-closed) would block legitimate reminders during any
    // forms-manager hiccup.
    if (metadata?.offline === true) {
      logger.info(
        {
          event: {
            category: saveAndExitLabel,
            action: 'skip-expiry-email-form-offline',
            reference: record.magicLinkId
          }
        },
        `[SAER] Skipping expiry reminder for ${record.magicLinkId} — form ${lockedRecord.form.id} is offline`
      )
      // Lock auto-expires after 1h (matching the default cron interval) so
      // the next tick re-checks; if the form is back online by then the user
      // still gets their reminder.
      return 'skipped'
    }

    const formTitle = metadata?.title ?? lockedRecord.form.title ?? 'your form'
    const emailContent = constructExpiryReminderEmailContent(
      lockedRecord,
      formTitle
    )

    const timer = createTimer()
    await sendNotification(emailContent)

    logger.info(
      {
        event: {
          category: saveAndExitLabel,
          action: 'send-expiry-email',
          reference: record.magicLinkId,
          duration: timer.elapsed
        }
      },
      `[SAER] Sent expiry reminder email for ${record.magicLinkId} (${timer.elapsed}ms)`
    )

    await markExpiryEmailSent(record.magicLinkId, runtimeId)

    return 'processed'
  } catch (err) {
    logger.error(
      {
        err,
        event: {
          category: saveAndExitLabel,
          action: 'process-record-failed',
          reference: record.magicLinkId
        }
      },
      `[SAER] Failed to process expiring record ${record.magicLinkId}: ${getErrorMessage(err)}`
    )
    return 'failed'
  }
}

/**
 * Process expiring save-and-exit records
 * @param {string} runtimeId - The global runtime ID
 * @param {number} expiryWindowInHours - Number of hours before expiry
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processExpiringSaveAndExitRecords(
  runtimeId,
  expiryWindowInHours
) {
  logger.info('[SAER] Starting to process expiring save-and-exit records')

  const batchLimit = 100

  let processedCount = 0
  let failedCount = 0

  // Local cache for form metadata (scoped to this run)
  /** @type {Map<string, FormMetadata | null>} */
  const formMetadataCache = new Map()

  let hasMore = true

  while (hasMore) {
    /** @type {Awaited<ReturnType<typeof findExpiringRecords>>} */
    let expiringRecords

    try {
      expiringRecords = await findExpiringRecords(
        expiryWindowInHours,
        minimumHoursRemaining,
        batchLimit
      )
    } catch (err) {
      logger.error(
        err,
        `[SAER] Failed to process expiring save-and-exit records: ${getErrorMessage(err)}`
      )
      throw err
    }

    if (expiringRecords.length === 0) {
      if (processedCount === 0 && failedCount === 0) {
        logger.info('[SAER] No expiring save-and-exit records found')
      }
      break
    }

    logger.info(
      `[SAER] Batch starting to process ${expiringRecords.length} expiring save-and-exit records`
    )

    for (const record of expiringRecords) {
      const outcome = await processExpiringRecord(
        record,
        runtimeId,
        formMetadataCache
      )

      if (outcome === 'processed') {
        processedCount++
      } else if (outcome === 'failed') {
        failedCount++
      } // Else do nothing, record has been skipped.
    }

    hasMore = expiringRecords.length >= batchLimit
  }

  logger.info(
    `[SAER] Completed processing expiring records. Processed: ${processedCount}, Failed: ${failedCount}`
  )

  return { processed: processedCount, failed: failedCount }
}

/**
 * @import { FormMetadata } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 * @import { SendNotificationArgs } from '~/src/services/notify.js'
 */
