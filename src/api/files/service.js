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

export async function get(formId, fileId) {
  // TODO
}

/**
 * @import { UploadPayload } from '~/src/api/types.js'
 */
