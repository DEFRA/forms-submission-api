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
 * Retrieves form title from document or fetches it from the forms service
 * @param {WithId<SaveAndExitDocument>} record
 * @param {Map<string, { title: string, slug: string}>} formTitleCache
 * @returns {Promise<{ title: string, slug: string}>}
 */
async function getFormTitleAndSlug(record, formTitleCache) {
  // Check cache first
  if (formTitleCache.has(record.form.id)) {
    return /** @type {{ title: string, slug: string}} */ (
      formTitleCache.get(record.form.id)
    )
  }

  // Fetch from forms service and cache it
  try {
    const timer = createTimer()
    const metadata = await getFormMetadataById(record.form.id)
    const { title, slug } = metadata
    formTitleCache.set(record.form.id, { title, slug })
    logger.info(
      {
        event: {
          category: saveAndExitLabel,
          action: 'fetch-form-title',
          reference: record.magicLinkId,
          duration: timer.elapsed
        }
      },
      `[SAER] Fetched form title and slug for ${record.form.id} (${timer.elapsed}ms)`
    )
    return { title, slug }
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
      `[SAER] Failed to fetch form title and slug for ${record.form.id}, using fallback`
    )
    return { title: 'your form', slug: 'unknown' }
  }
}

/**
 * The 'resume' link is different depending on whether we're dealing with
 * a makgic link Save-and-exit, or a logged-in/authenticated save-and-exit
 * @param {WithId<SaveAndExitDocument>} document
 * @param {{ title: string, slug: string }} formTitleAndSlug
 */
export function getResumeLink(document, formTitleAndSlug) {
  if ('auth' in document) {
    // Authenticated save-and-exit
    const previewDraftStub = document.form.isPreview
      ? `preview/${document.form.status}/`
      : ''
    return `${document.form.baseUrl}/homepage/${previewDraftStub}${formTitleAndSlug.slug}`
  }
  // Magic link save-and-exit
  return `${document.form.baseUrl}/resume-form/${document.form.id}/${document.magicLinkId}`
}

/**
 * Constructs email content for expiry reminder
 * @param {WithId<SaveAndExitDocument>} document
 * @param {{ title: string, slug: string }} formTitleAndSlug
 * @returns {SendNotificationArgs}
 */
export function constructExpiryReminderEmailContent(
  document,
  formTitleAndSlug
) {
  const { templateId, emailReplyToId } = getNotifyEmailConfig()

  // Calculate hours remaining until expiry (rounded down)
  const now = new Date()
  const timeRemainingMs = document.expireAt.getTime() - now.getTime()
  const hoursRemaining = Math.floor(timeRemainingMs / (1000 * 60 * 60))
  const hoursRemainingText =
    hoursRemaining === 1 ? `${hoursRemaining} hour` : `${hoursRemaining} hours`

  const emailSubject = `Form progress expires in ${hoursRemainingText}`

  const emailBody = `# Form progress expires soon

Your progress with ${formTitleAndSlug.title} expires in ${hoursRemainingText}.

[Continue with your form](${getResumeLink(document, formTitleAndSlug)})

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
 * @param {Map<string, { title: string, slug: string }>} formTitleCache
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

    const formTitleAndSlug = await getFormTitleAndSlug(
      lockedRecord,
      formTitleCache
    )
    const emailContent = constructExpiryReminderEmailContent(
      lockedRecord,
      formTitleAndSlug
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
 * @import { SaveAndExitDocument, SaveAndExitV2Document } from '~/src/api/types.js'
 * @import { SendNotificationArgs } from '~/src/services/notify.js'
 */
