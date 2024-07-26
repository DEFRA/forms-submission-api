import * as repository from './repository.js'

import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Accepts files into the forms-submission-api
 * @param {UploadPayload} uploadPayload
 */
export async function ingestFile(uploadPayload) {
  const { formId } = uploadPayload.metadata

  let successfulFiles = 0

  for (const file in uploadPayload.form) {
    const fileStatus = uploadPayload.form[file]

    if (typeof fileStatus === 'string') {
      logger.warn(
        `Received a string under key '${file}' instead of a FileUploadStatus, skipping`
      )

      // this a result of client error (in forms-runner) but not something we care about here, we only need files
      continue
    }

    if (fileStatus.fileStatus === 'complete') {
      await repository.create({
        formId,
        ...fileStatus
      })

      successfulFiles++
    } else {
      logger.error(
        `File received which has not yet completed. Upload ID: ${fileStatus.fileId}}, status: ${fileStatus.fileStatus}.`
      )
      // nothing we can do other than flag this with the CDP team
    }
  }

  return successfulFiles
}

/**
 * @import { UploadPayload } from '~/src/api/types.js'
 */
