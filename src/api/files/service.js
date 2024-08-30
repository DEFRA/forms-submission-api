import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
import { MongoServerError } from 'mongodb'

import * as repository from './repository.js'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { client as mongoClient } from '~/src/mongo.js'

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

  await assertFileExists(
    fileContainer,
    Boom.badRequest('File does not exist in S3')
  )

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
 * Confirms a file exists in S3 by throwing Boom.badRequest if not.
 * @param {FileUploadStatus} fileUploadStatus
 * @param {Error} errorToThrow
 */
async function assertFileExists(fileUploadStatus, errorToThrow) {
  try {
    const client = getS3Client()

    const command = new HeadObjectCommand({
      Bucket: fileUploadStatus.s3Bucket,
      Key: fileUploadStatus.s3Key
    })

    await client.send(command)
  } catch (err) {
    if (err instanceof NotFound) {
      logger.error(
        err,
        `Recieved request to ingest ${fileUploadStatus.s3Key}, but the file does not exist.`
      )
      throw errorToThrow
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

  await assertFileExists(fileStatus, Boom.resourceGone())

  const command = new GetObjectCommand({
    Bucket: fileStatus.s3Bucket,
    Key: fileStatus.s3Key
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}

/**
 * Extends the time-to-live of a file to 30 days and updates the retrieval key.
 * @param {{fileId: string, initiatedRetrievalKey: string}[]} files
 * @param {string} persistedRetrievalKey - an updated retrieval key to persist the file
 */
export async function persistFiles(files, persistedRetrievalKey) {
  const client = getS3Client()
  const session = mongoClient.startSession()

  /**
   * @type {Promise<{ fileId: string, s3Bucket: string; oldS3Key: string; newS3Key: string; }>[]}
   */
  let updateFiles = []

  try {
    await session.withTransaction(async () => {
      logger.info(`Persisting ${files.length} files`)

      updateFiles = files.map(({ fileId, initiatedRetrievalKey }) =>
        copyS3File(fileId, initiatedRetrievalKey, client)
      )

      for await (const { fileId, newS3Key } of updateFiles) {
        // Mongo doesn't support parallel transactions, so we have to await each one
        await repository.updateS3Key(fileId, newS3Key, session)
      }

      // Once we know the files have copied successfully, we can update the database
      const persistedRetrievalKeyHashed = await argon2.hash(
        persistedRetrievalKey
      )

      await repository.updateRetrievalKeys(
        files.map(({ fileId }) => fileId),
        persistedRetrievalKeyHashed,
        session
      )
    })

    logger.info(`Finished persisting ${files.length} files`)
  } catch (err) {
    logger.error(err, 'Error persisting files')

    // no point persisting part of a batch. clean it up.
    await deleteOldFiles(updateFiles, 'newS3Key', client)

    throw err
  } finally {
    await session.endSession()
  }

  // Usage example:
  if (updateFiles.length) {
    // Only delete the old files once the pointer update has succeeded. Handle this outside of the DB session as we don't
    // want a failure here to revert our DB changes. If this fails, files will naturally expire in the original directory after 7 days
    // anyway, so this ultimately is just a cost issue not a functional one.
    await deleteOldFiles(updateFiles, 'oldS3Key', client)
  }
}

/**
 * Deletes old files in staging based on the provided keys.
 * @param {Promise<{ fileId: string, s3Bucket: string; oldS3Key: string; newS3Key: string; }>[]} keys - an array of files to handle
 * @param {('oldS3Key'|'newS3Key')} lookupKey - the key to use to look up the S3 key
 * @param {S3Client} client - S3 client
 */
async function deleteOldFiles(keys, lookupKey, client) {
  // AWS do have the DeleteObjects command instead which would be preferable. However, S3 keys
  // are stored on a per-document basis not a global and so we can't batch these up in case of any
  // variation.
  return Promise.all(
    keys.map(async (obj) =>
      client.send(
        new DeleteObjectCommand({
          Bucket: (await obj).s3Bucket,
          Key: (await obj)[lookupKey]
        })
      )
    )
  )
}

/**
 * Copies a file document to the loaded S3 directory.
 * @param {string} fileId
 * @param {string} initiatedRetrievalKey - retrieval key when initiated
 * @param {S3Client} client - S3 client
 */
async function copyS3File(fileId, initiatedRetrievalKey, client) {
  const fileStatus = await getAndVerify(fileId, initiatedRetrievalKey)

  if (!fileStatus.s3Key || !fileStatus.s3Bucket) {
    throw Boom.internal(`S3 key/bucket is missing for file ID ${fileId}`)
  }

  if (fileStatus.s3Key.startsWith(loadedPrefix)) {
    throw Boom.badRequest(`File ID ${fileId} has already been persisted`)
  }

  const oldS3Key = fileStatus.s3Key
  const filename = oldS3Key.split('/').at(-1)
  const newS3Key = `${loadedPrefix}/${filename}`

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: fileStatus.s3Bucket,
        Key: newS3Key,
        CopySource: `${fileStatus.s3Bucket}/${oldS3Key}`
      })
    )
  } catch (err) {
    if (err instanceof NoSuchKey) {
      throw Boom.resourceGone(`File ${fileId} no longer exists`)
    }

    throw err
  }

  return {
    fileId,
    s3Bucket: fileStatus.s3Bucket,
    oldS3Key,
    newS3Key
  }
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
    throw Boom.forbidden(`Retrieval key for file ${fileId} is incorrect`)
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
export async function checkFileStatus(fileId) {
  const fileStatus = await repository.getByFileId(fileId)

  if (!fileStatus) {
    throw Boom.notFound()
  }

  await assertFileExists(fileStatus, Boom.resourceGone())
}

/**
 * @import { FileUploadStatus, UploadPayload } from '~/src/api/types.js'
 * @import { ClientSession } from 'mongodb'
 */
