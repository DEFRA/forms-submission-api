import Boom from '@hapi/boom'

import * as repository from './repository.js'

import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Accepts files into the forms-submission-api
 * @param {UploadPayload} uploadPayload
 */
export function ingestFile(uploadPayload) {
  const { formId } = uploadPayload.metadata

  const fileContainer = uploadPayload.form.file

  if (typeof fileContainer !== 'object') {
    const error =
      'payload.form.file was not of type instead of a FileUploadStatus'

    logger.error(error)

    throw Boom.badRequest(error)
  }

  if (fileContainer.fileStatus !== 'complete') {
    const error = `File received which was not complete. Upload ID: ${fileContainer.fileId}, status: ${fileContainer.fileStatus}.`

    logger.error(error)

    throw Boom.badRequest(error)
  }

  return repository.create({
    formId,
    ...fileContainer
  })
}

/**
 * @import { UploadPayload } from '~/src/api/types.js'
 */
