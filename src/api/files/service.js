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
 * Accepts file status into the forms-submission-api
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
  const fileStatus = await repository.getByFileId(fileId)

  if (!fileStatus) {
    throw Boom.notFound('File not found')
  }

  if (!(await argon2.verify(fileStatus.retrievalKey, retrievalKey))) {
    throw Boom.unauthorized('Retrieval key does not match')
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
