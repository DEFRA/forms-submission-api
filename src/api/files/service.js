import { randomUUID } from 'crypto'

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
import { stringify } from 'csv-stringify'
import { MongoServerError } from 'mongodb'

import * as repository from '~/src/api/files/repository.js'
import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { client as mongoClient } from '~/src/mongo.js'

const logger = createLogger()
const s3Region = config.get('s3Region')
const s3Bucket = config.get('s3Bucket')
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

  /** @type {FormFileUploadStatus} */
  const dataToSave = {
    fileId: fileContainer.fileId,
    filename: fileContainer.filename,
    contentType: fileContainer.contentType,
    s3Key: fileContainer.s3Key,
    s3Bucket: fileContainer.s3Bucket,
    retrievalKey: hashed
  }

  try {
    await repository.create(dataToSave)
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
 * Accepts submissions into the forms-submission-api
 * @param {SubmitPayload} submitPayload
 */
export async function submit(submitPayload) {
  const { sessionId, retrievalKey, main, repeaters } = submitPayload
  const hashed = await argon2.hash(retrievalKey)
  const contentType = 'text/csv'

  /**
   * Create the main CSV file
   */
  async function createMain() {
    const headers = main.map((rec) => rec.title)
    const values = main.map((rec) => rec.value)
    const csv = await createCsv([headers, values])
    const fileId = randomUUID()
    const fileKey = `${loadedPrefix}/${fileId}`

    await createS3File(fileKey, csv, contentType, getS3Client())

    await repository.create({
      fileId,
      filename: `${fileId}.csv`,
      contentType,
      s3Key: fileKey,
      s3Bucket,
      retrievalKey: hashed
    })

    return fileId
  }

  /**
   * @param {SubmitRecordset} repeater
   */
  async function createRepeater(repeater) {
    /**
     * @type {string[]}
     */
    const headers = []
    const values = repeater.value.map((value, index) => {
      if (index === 0) {
        headers.push(...value.map((val) => val.title))
      }
      return value.map((val) => val.value)
    })

    const csv = await createCsv([headers, ...values])
    const fileId = randomUUID()
    const fileKey = `${loadedPrefix}/${fileId}`

    await createS3File(fileKey, csv, contentType, getS3Client())

    await repository.create({
      fileId,
      filename: `${fileId}.csv`,
      contentType,
      s3Key: fileKey,
      s3Bucket,
      retrievalKey: hashed
    })

    return { name: repeater.name, fileId }
  }

  try {
    const mainFileId = await createMain()

    const repeaterResult = await Promise.allSettled(
      repeaters.map(createRepeater)
    )
    const fullfilled = repeaterResult.filter(
      (result) => result.status === 'fulfilled'
    )

    if (fullfilled.length !== repeaterResult.length) {
      throw Boom.internal('Failed to save repeater files')
    }

    return {
      main: mainFileId,
      repeaters: Object.fromEntries(
        fullfilled.map((result) => [result.value.name, result.value.fileId])
      )
    }
  } catch (err) {
    logger.error(err)

    if (Boom.isBoom(err)) {
      throw err
    }

    throw new Error(`Failed to save files for session ID '${sessionId}'.`)
  }
}

/**
 * @param {Input} input
 * @returns {Promise<string>}
 */
function createCsv(input) {
  return new Promise((resolve, reject) => {
    stringify(
      input,
      /** @type {Callback} */ function (err, output) {
        if (err) {
          reject(err instanceof Error ? err : new Error('CSV stringify error'))
          return
        }

        resolve(output)
      }
    )
  })
}

/**
 * Confirms a file exists in S3 by throwing Boom.badRequest if not.
 * @param {{s3Bucket?: string, s3Key?: string}} fileIdentifier - Object containing S3 bucket and key information
 * @param {Error} errorToThrow
 * @param {boolean} [logAsError] - whether to log the error
 */
async function assertFileExists(
  fileIdentifier,
  errorToThrow,
  logAsError = true
) {
  try {
    const client = getS3Client()

    const command = new HeadObjectCommand({
      Bucket: fileIdentifier.s3Bucket,
      Key: fileIdentifier.s3Key
    })

    await client.send(command)
  } catch (err) {
    if (err instanceof NotFound) {
      logger[logAsError ? 'error' : 'info'](
        err,
        `Received request for ${fileIdentifier.s3Key}, but the file does not exist.`
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
    Key: fileStatus.s3Key,
    ResponseContentDisposition: `attachment;filename="${fileStatus.filename}"`
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
    updateFiles = files.map(({ fileId, initiatedRetrievalKey }) =>
      copyS3File(fileId, initiatedRetrievalKey, client)
    )

    const res = await Promise.all(updateFiles)

    await session.withTransaction(async () => {
      logger.info(`Persisting ${files.length} files`)

      await repository.updateS3Keys(res, session)

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
 * Create a file in S3.
 * @param {string} key - the key of the file
 * @param {string} body - file body
 * @param {string} contentType - content type
 * @param {S3Client} client - S3 client
 */
function createS3File(key, body, contentType, client) {
  return client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  )
}

/**
 * Deletes old files in staging based on the provided keys.
 * @param {Promise<{ fileId: string, s3Bucket: string; oldS3Key: string; newS3Key: string; }>[]} keys - an array of files to handle
 * @param {('oldS3Key'|'newS3Key')} lookupKey - the key to use to look up the S3 key
 * @param {S3Client} client - S3 client
 */
async function deleteOldFiles(keys, lookupKey, client) {
  const settledKeys = await Promise.allSettled(keys)
  const filteredKeys = settledKeys
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)

  // AWS do have the DeleteObjects command instead which would be preferable. However, S3 keys
  // are stored on a per-document basis not a global and so we can't batch these up in case of any
  // variation.
  return Promise.all(
    filteredKeys.map((obj) =>
      client.send(
        new DeleteObjectCommand({
          Bucket: obj.s3Bucket,
          Key: obj[lookupKey]
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

  await assertFileExists(fileStatus, Boom.resourceGone(), false)
}

/**
 * @import { SubmitPayload, SubmitRecordset } from '@defra/forms-model'
 * @import { Input, Callback } from 'csv-stringify'
 * @import { FormFileUploadStatus, UploadPayload } from '~/src/api/types.js'
 */
