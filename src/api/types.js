/**
 * @typedef {Request<{ Server: { db: Db }, Payload: UploadPayload }>} RequestFileUpload
 */

/**
 * @template {import('@hapi/hapi').ReqRef} [ReqRef=import('@hapi/hapi').ReqRefDefaults]
 * @typedef {import('@hapi/hapi').Request<ReqRef>} Request
 */

/**
 * @typedef {import('mongodb').Db} Db
 */

/**
 * @typedef {object} FileUploadStatus
 * @property {string} fileId - uuid of the file
 * @property {string} filename - filename of file uploaded, if present
 * @property {string} contentType - The mime type as declared in the multipart upload
 * @property {('complete'|'rejected'|'pending')} fileStatus - complete or rejected if the virus scan has completed, pending if its still in progress
 * @property {number} contentLength - Size of file in bytes
 * @property {string} checksumSha256 - SHA256 check sum of file recieved by cdp-uploader before uploading to S3 bucket
 * @property {string} detectedContentType - The mime type as detected by the CDP-Uploader
 * @property {string} [s3Key] - S3 bucket where scanned file is moved. Only set if file status is complete
 * @property {string} [s3Bucket] - S3 Path where scanned file is moved. Includes path prefix if set. Only set when fileStatus is complete
 * @property {boolean} hasError - true/false Only set to true if the file has been rejected or could not be delivered. Reason is supplied in errorMessage field.
 * @property {string} [errorMessage] - Reason why file was rejected. Error message is based on GDS design guidelines and can be show directly to the end-user.
 */

/** @typedef {{formId: string} & FileUploadStatus} FormFileUploadStatus */

/**
 * @typedef {object} UploadPayload
 * @property {('initiated'|'pending'|'ready')} uploadStatus - Have all scans completed, can be initiated, pending or ready
 * @property {{formId: string}} metadata - Extra data and identified set by the requesting service in the /initialize call. Returned exactly as they were presented
 * @property {Object.<string, FileUploadStatus|string>} form - An object representing each field in the multipart request. Text fields are preserved exactly as they were sent, file fields contain details about the file.
 * @property {number} numberOfRejectedFiles - Total number of files that have been rejected by the uploader
 */
