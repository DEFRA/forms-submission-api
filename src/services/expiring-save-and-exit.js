import { getErrorMessage } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { createTimer } from '~/src/helpers/timer.js'
import {
  findExpiringRecords,
  lockRecordForExpiryEmail,
  markExpiryEmailSent,
  saveAndExitLabel
} from '~/src/repositories/save-and-exit-repository.js'
import { getFormMetadataById } from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'

const logger = createLogger()

const notifyTemplateId = config.get('notifyTemplateId')
const notifyReplyToId = config.get('notifyReplyToId')
const minimumHoursRemaining = config.get(
  'emailUsersExpiringSoonSavedForLaterLink.minimumHoursRemaining'
)

/**
 * Retrieves form title from document or fetches it from the forms service
 * @param {WithId<SaveAndExitDocument>} record
 * @param {Map<string, string>} formTitleCache
 * @returns {Promise<string>}
 */
async function getFormTitle(record, formTitleCache) {
  // If the document has a title, use it
  if (record.form.title) {
    return record.form.title
  }

  // Check cache first
  if (formTitleCache.has(record.form.id)) {
    return /** @type {string} */ (formTitleCache.get(record.form.id))
  }

  // Fetch from forms service and cache it
  try {
    const timer = createTimer()
    const metadata = await getFormMetadataById(record.form.id)
    const title = metadata.title
    formTitleCache.set(record.form.id, title)
    logger.info(
      {
        event: {
          category: saveAndExitLabel,
          action: 'fetch-form-title',
          reference: record.magicLinkId,
          duration: timer.elapsed
        }
      },
      `[SAER] Fetched form title for ${record.form.id} (${timer.elapsed}ms)`
    )
    return title
  } catch (err) {
    logger.warn(
      {
        err,
        event: {
          category: saveAndExitLabel,
          action: 'fetch-form-title-failed',
          reference: record.magicLinkId
        }
      },
      `[SAER] Failed to fetch form title for ${record.form.id}, using fallback`
    )
    return 'your form'
  }
}

/**
 * Constructs email content for expiry reminder
 * @param {WithId<SaveAndExitDocument>} document
 * @param {string} formTitle
 * @returns {SendNotificationArgs}
 */
export function constructExpiryReminderEmailContent(document, formTitle) {
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

^ The link will only work once. If you want to save your progress again after resuming your form, you will need to repeat the save process to generate a new link.

The link is valid for ${hoursRemainingText}. After that time, your saved information will be deleted.
`

  return {
    emailAddress: document.email,
    templateId: notifyTemplateId,
    personalisation: {
      subject: emailSubject,
      body: emailBody
    },
    emailReplyToId: notifyReplyToId
  }
}

/**
 * Process a single expiring record: lock, send email, mark as sent
 * @param {Awaited<ReturnType<typeof findExpiringRecords>>[number]} record
 * @param {string} runtimeId
 * @param {Map<string, string>} formTitleCache
 * @returns {Promise<'processed' | 'skipped' | 'failed'>}
 */
async function processExpiringRecord(record, runtimeId, formTitleCache) {
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

    const formTitle = await getFormTitle(lockedRecord, formTitleCache)
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

  // Local cache for form titles (scoped to this run)
  const formTitleCache = new Map()

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
        formTitleCache
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
 * @import { WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 * @import { SendNotificationArgs } from '~/src/services/notify.js'
 */
