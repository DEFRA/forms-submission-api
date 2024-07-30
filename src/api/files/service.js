import Boom from '@hapi/boom'
import { MongoServerError } from 'mongodb'

import * as repository from './repository.js'

import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Accepts files into the forms-submission-api
 * @param {UploadPayload} uploadPayload
 */
export async function ingestFile(uploadPayload) {
  const { formId } = uploadPayload.metadata
  const { file: fileContainer } = uploadPayload.form

  if (typeof fileContainer !== 'object') {
    const error = 'payload.form.file was not of type object'
    logger.error(error)

    throw Boom.badRequest(error)
  }

  if (!formId?.length) {
    const error = 'payload.metadata.formId was not provided'
    logger.error(error)

    throw Boom.badRequest(error)
  }

  if (fileContainer.fileStatus !== 'complete') {
    const error = `File received which was not complete. Upload ID: ${fileContainer.fileId}, status: ${fileContainer.fileStatus}.`
    logger.error(error)

    throw Boom.badRequest(error)
  }

  try {
    await repository.create({
      formId,
      ...fileContainer
    })
  } catch (err) {
    if (err instanceof MongoServerError && err.errorResponse.code === 11000) {
      const error = `File ID '${fileContainer.fileId}' for form ID '${formId}' has already been ingested`
      logger.error(error)

      throw Boom.badRequest(error)
    }

    throw err
  }
}

/**
 * @import { UploadPayload } from '~/src/api/types.js'
 */
