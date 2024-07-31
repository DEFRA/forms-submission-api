import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
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
  const { retrievalKey } = uploadPayload.metadata
  const { file: fileContainer } = uploadPayload.form

  const hashed = await argon2.hash(retrievalKey)

  try {
    await repository.create({
      ...fileContainer,
      retrievalKey: hashed
    })
  } catch (err) {
    if (err instanceof MongoServerError && err.errorResponse.code === 11000) {
      const error = `File ID '${fileContainer.fileId}' has has already been ingested`
      logger.error(error)

      throw Boom.badRequest(error)
    }

    throw err
  }
}

/**
 *
 * @param {string} fileId
 * @param {string} retrievalKey
 * @returns {Promise<string>} presigned url
 */
export async function getPresignedLink(fileId, retrievalKey) {
  const fileStatus = await repository.get(fileId)

  if (!fileStatus) {
    throw Boom.notFound('File not found')
  }

  if (!(await argon2.verify(fileStatus.retrievalKey, retrievalKey))) {
    throw Boom.forbidden('Retrieval key does not match')
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
