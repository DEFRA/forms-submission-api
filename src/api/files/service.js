import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
import { MongoServerError } from 'mongodb'

import * as repository from './repository.js'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'

const logger = createLogger()
const s3Region = config.get('s3Region')
const loadedPrefix = config.get('loadedPrefix')

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
      const error = `File ID '${fileContainer.fileId}' has already been ingested`
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
  const fileStatus = await getAndVerify(fileId, retrievalKey)
  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: fileStatus.s3Bucket,
    Key: fileStatus.s3Key
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}

/**
 * Extends the time-to-live of a file to 30 days
 * @param {string} fileId
 * @param {string} retrievalKey
 */
export async function extendTtl(fileId, retrievalKey) {
  const fileStatus = await getAndVerify(fileId, retrievalKey)

  if (!fileStatus.s3Key || !fileStatus.s3Bucket) {
    throw Boom.internal(`S3 key/bucket is missing for file ID ${fileId}`)
  }

  if (fileStatus.s3Key.startsWith(loadedPrefix)) {
    throw Boom.badRequest(`File ID ${fileId} has already had its TTL extended`)
  }

  const client = getS3Client()

  const oldS3Key = fileStatus.s3Key
  const filename = oldS3Key.split('/').at(-1)
  const newS3Key = `${loadedPrefix}/${filename}`

  return moveFile(fileId, client, fileStatus.s3Bucket, oldS3Key, newS3Key)
}

/**
 * Moves a file from one location to another and updates the database.
 * @param {string} fileId
 * @param {S3Client} client
 * @param {string} bucket
 * @param {string} oldS3Key
 * @param {string} newS3Key
 */
async function moveFile(fileId, client, bucket, oldS3Key, newS3Key) {
  logger.info(`Copying file ${oldS3Key} to ${newS3Key}`)
  // Copy the file to the loaded prefix, which has a 30 day expiry
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: newS3Key,
      CopySource: `${bucket}/${oldS3Key}`
    })
  )

  logger.info(`Updating file ${fileId} with new S3 key '${newS3Key}'`)

  // Now that the file transfer was successful, update the record in the DB
  await repository.updateS3Key(fileId, newS3Key)

  logger.info(`Deleting old file ${oldS3Key}`)

  // We no longer need the old file
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: oldS3Key
    })
  )
}

/**
 * Retrieves a file status from the database, verifying the retrieval key before returning.
 * @param {string} fileId
 * @param {string} retrievalKey
 */
async function getAndVerify(fileId, retrievalKey) {
  const fileStatus = await repository.getByFileId(fileId)

  if (!fileStatus) {
    throw Boom.notFound('File not found')
  }

  const retrievalKeyCorrect = await argon2.verify(
    fileStatus.retrievalKey,
    retrievalKey
  )

  if (!retrievalKeyCorrect) {
    throw Boom.forbidden('Retrieval key does not match')
  }

  return fileStatus
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
