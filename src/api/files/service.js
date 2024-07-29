import Boom from '@hapi/boom'
import { MongoServerError } from 'mongodb'

import * as repository from './repository.js'

import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Accepts file status into the forms-submission-api
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
 * Checks if a file status exists for a given upload ID. Throws an Not Found error if not in the database.
 * @param {string} fileId
 * @throws {Boom.notFound} - if the file status does not exist
 */
export async function checkExists(fileId) {
  const fileStatus = await repository.getByFileId(fileId)

  if (!fileStatus) {
    throw Boom.notFound()
  }
}

/**
 * @import { UploadPayload } from '~/src/api/types.js'
 */
