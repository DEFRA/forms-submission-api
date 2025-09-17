/**
 * @typedef {Request<{ Server: { db: Db }, Payload: UploadPayload }>} RequestFileCreate
 */

/**
 * @typedef {{ fileId: string }} FileRetrievalPayload
 * @typedef {{ fileId: string, retrievalKey: string }} FileAccessPayload
 * @typedef {{ files: {fileId: string, initiatedRetrievalKey: string}[], persistedRetrievalKey: string }} PersistedRetrievalPayload
 */

/**
 * @typedef {{ link: string }} GetSavedLinkParams
 * @typedef {{ Params: { link: string }, Payload: { securityAnswer: string }}} ValidateSaveAndExit
 */
/**
 * @typedef {object} FileUploadStatus
 * @property {string} fileId - uuid of the file
 * @property {string} filename - filename of file uploaded, if present
 * @property {string} [contentType] - The mime type as declared in the multipart upload
 * @property {('complete'|'rejected'|'pending')} fileStatus - complete or rejected if the virus scan has completed, pending if its still in progress
 * @property {string} [s3Key] - S3 bucket where scanned file is moved
 * @property {string} [s3Bucket] - S3 Path where scanned file is moved. Includes path prefix if set
 * @property {boolean} [hasError] - true/false Only set to true if the file has been rejected or could not be delivered. Reason is supplied in errorMessage field.
 * @property {string} [errorMessage] - Reason why file was rejected. Error message is based on GDS design guidelines and can be show directly to the end-user.
 */

/**
 * @typedef {Omit<FileUploadStatus, 'fileStatus'> & { retrievalKey: string, retrievalKeyIsCaseSensitive?: boolean }} FormFileUploadStatus
 * @typedef {FormFileUploadStatus & { form?: { id: string, name: string, slug: string, pagePath: string }}} FormFileUploadStatusRecord
 * @typedef {SaveAndExitMessageData & { expiredAt: Date }} SaveAndExit
 */

/**
 * @typedef {object} UploadPayload
 * @property {('initiated'|'pending'|'ready')} uploadStatus - Have all scans completed, can be initiated, pending or ready
 * @property {{retrievalKey: string, formId: string, formSlug: string, formName: string, pagePath: string}} metadata - Extra data and identified set by the requesting service in the /initialize call. Returned exactly as they were presented
 * @property {Record<string, FileUploadStatus>} form - An object representing each field in the multipart request. Text fields are preserved exactly as they were sent, file fields contain details about the file.
 * @property {number} numberOfRejectedFiles - Total number of files that have been rejected by the uploader
 */

/**
 * @import { SaveAndExitMessageData } from '@defra/forms-model'
 * @import { Request } from '@hapi/hapi'
 * @import { Db } from 'mongodb'
 */
