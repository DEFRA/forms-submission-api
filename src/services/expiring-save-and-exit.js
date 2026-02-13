import { getErrorMessage } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  findExpiringRecords,
  lockRecordForExpiryEmail,
  markExpiryEmailSent
} from '~/src/repositories/save-and-exit-repository.js'
import { getFormMetadataById } from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'

const logger = createLogger()

const notifyExpiryReminderTemplateId = config.get(
  'notifyExpiryReminderTemplateId'
)
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
    const metadata = await getFormMetadataById(record.form.id)
    const title = metadata.title
    formTitleCache.set(record.form.id, title)
    return title
  } catch (err) {
    logger.warn(
      err,
      `Failed to fetch form title for ${record.form.id}, using fallback`
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
    templateId: notifyExpiryReminderTemplateId,
    personalisation: {
      subject: emailSubject,
      body: emailBody
    },
    emailReplyToId: notifyReplyToId
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
  logger.info('Starting to process expiring save-and-exit records')

  let processedCount = 0
  let failedCount = 0

  // Local cache for form titles (scoped to this run)
  const formTitleCache = new Map()

  try {
    const expiringRecords = await findExpiringRecords(
      expiryWindowInHours,
      minimumHoursRemaining
    )

    if (expiringRecords.length === 0) {
      logger.info('No expiring save-and-exit records found')
      return { processed: 0, failed: 0 }
    }

    logger.info(`Processing ${expiringRecords.length} expiring records`)

    for (const record of expiringRecords) {
      try {
        const lockedRecord = await lockRecordForExpiryEmail(
          record.magicLinkId,
          runtimeId,
          record.version ?? 1
        )

        if (!lockedRecord) {
          logger.info(`Skipping ${record.magicLinkId} - failed to obtain lock`)
          continue
        }

        if (lockedRecord.notify?.expireLockId !== runtimeId) {
          logger.warn(
            `Lock verification failed for ${record.magicLinkId} - lock ID mismatch`
          )
          continue
        }

        const formTitle = await getFormTitle(lockedRecord, formTitleCache)
        const emailContent = constructExpiryReminderEmailContent(
          lockedRecord,
          formTitle
        )
        await sendNotification(emailContent)

        logger.info(
          `Sent expiry reminder email for ${record.magicLinkId} to ${record.email}`
        )

        await markExpiryEmailSent(record.magicLinkId, runtimeId)

        processedCount++
      } catch (err) {
        logger.error(
          err,
          `Failed to process expiring record ${record.magicLinkId}: ${getErrorMessage(err)}`
        )
        failedCount++
      }
    }

    logger.info(
      `Completed processing expiring records. Processed: ${processedCount}, Failed: ${failedCount}`
    )

    return { processed: processedCount, failed: failedCount }
  } catch (err) {
    logger.error(
      err,
      `Failed to process expiring save-and-exit records: ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * @import { WithId } from 'mongodb'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 * @import { SendNotificationArgs } from '~/src/services/notify.js'
 */
