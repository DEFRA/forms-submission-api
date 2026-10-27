import { FormRowStatus } from '~/src/constants.js'
import { getSubmissionRecordsForUser } from '~/src/repositories/submission-repository.js'
import { getSaveAndExitRecordsForUser } from '~/src/services/save-and-exit-service.js'

/**
 * @param {SaveAndExitRecordMapped[]} records
 * @returns {FormRecord[]}
 */
function mapSaveAndExit(records) {
  return records.map((record) => {
    const expired = record.expireAt < new Date()
    const expiredOrInProgess = expired
      ? FormRowStatus.Expired
      : FormRowStatus.InProgress
    return {
      status: record.isDeleted ? FormRowStatus.Deleted : expiredOrInProgess,
      ...record
    }
  })
}

/**
 * @param {FormSubmissionDocument[]} records
 * @returns {FormRecord[]}
 */
function mapSubmission(records) {
  return records.map((record) => ({
    referenceNumber: record.meta.referenceNumber,
    status:
      record.expireAt < new Date()
        ? FormRowStatus.Expired
        : FormRowStatus.Submitted,
    createdAt: record.recordCreatedAt
  }))
}

/**
 * Get form records for a user based on form ID
 * @param {string} sub - the user's subject identifier
 * @param {string} iss - the issuer of the token
 * @param {string} formId - the form ID
 * @param {FormStatus} [preview] - the preview state, or none for a live form
 * @returns { Promise<FormRecord[]> }
 */
export async function getFormRecordsForUser(sub, iss, formId, preview) {
  const [saveAndExitRecords, submissionRecords] = await Promise.all([
    getSaveAndExitRecordsForUser(sub, iss, formId, preview),
    getSubmissionRecordsForUser(sub, iss, formId, preview)
  ])
  const records = [
    ...mapSaveAndExit(saveAndExitRecords),
    ...mapSubmission(submissionRecords)
  ]

  return records.sort(formRowSorter)
}

// Order of statuses for sorting purposes
// The order isn't necessarily alphabetical, so we define a custom order here
const statusOrder = /** @type {Record<string, number>} */ ({
  [FormRowStatus.InProgress]: 1,
  [FormRowStatus.Submitted]: 2,
  [FormRowStatus.Expired]: 3,
  [FormRowStatus.Deleted]: 4
})

/**
 * Sort the rows by status (alphabetically descending), then by 'updatedAt' ascending
 * @param {FormRecord} a
 * @param {FormRecord} b
 */
export function formRowSorter(a, b) {
  const statusA = statusOrder[a.status] || 0
  const statusB = statusOrder[b.status] || 0

  return statusA - statusB || b.createdAt.getTime() - a.createdAt.getTime()
}

/**
 * @typedef {object} FormRecord
 * @property {keyof statusOrder} status - the status of the form row (InProgress, Submitted, Expired, or Deleted)
 * @property {string} [referenceNumber] - the reference number for submitted forms
 * @property {Date} createdAt - the created timestamp for the form row
 * @property {Date} [expireAt] - the expiration timestamp of the record
 * @property {string} [magicLinkId] - the magic link ID for the save and exit record
 * @property {string} [formTitle] - the title of the form
 */

/**
 * @import { FormStatus } from '@defra/forms-model'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 * @import { SaveAndExitRecordMapped } from '~/src/services/save-and-exit-service.js'
 */
