import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import { MongoServerError } from 'mongodb'

import * as repository from './repository.js'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()
const s3Region = config.get('s3Region')

/**
 * Accepts a file into the forms-submission-api. Expects only one file from CDP named
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

/**
 *
 * @param {string} formId
 * @param {string} fileId
 * @returns {Promise<string>} presigned url
 */
export async function getPresignedLink(formId, fileId) {
  const fileStatus = await repository.get(fileId, formId)

  if (!fileStatus) {
    throw Boom.notFound('File not found')
  }

  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: fileStatus.s3Bucket,
    Key: fileStatus.s3Key
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}

/**
 * Retrieves an S3 client
 * @returns
 */
function getS3Client() {
  return new S3Client({
    region: s3Region,
    ...(config.get('s3Endpoint') && {
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: true
    })
  })
}

/**
 * @import { UploadPayload } from '~/src/api/types.js'
 */
