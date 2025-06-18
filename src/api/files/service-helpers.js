import { randomUUID } from 'crypto'

import Boom from '@hapi/boom'

import { createCsv, createS3File, getS3Client } from './utils.js'

import * as repository from '~/src/api/files/repository.js'
import { config } from '~/src/config/index.js'

const s3Bucket = config.get('s3Bucket')
const loadedPrefix = config.get('loadedPrefix')

/**
 * Creates a main CSV file from submission data
 * @param {{name: string, title: string, value: string}[]} main - Main form data
 * @param {string} hashedRetrievalKey - Hashed retrieval key
 * @param {boolean} retrievalKeyIsCaseSensitive - Whether retrieval key is case sensitive
 * @returns {Promise<string>} File ID
 */
export async function createMainCsvFile(
  main,
  hashedRetrievalKey,
  retrievalKeyIsCaseSensitive
) {
  const headers = main.map((rec) => rec.title)
  const values = main.map((rec) => rec.value)
  const csv = await createCsv([headers, values])
  const fileId = randomUUID()
  const fileKey = `${loadedPrefix}/${fileId}`
  const contentType = 'text/csv'

  await createS3File(fileKey, csv, contentType, getS3Client())

  await repository.create({
    fileId,
    filename: `${fileId}.csv`,
    contentType,
    s3Key: fileKey,
    s3Bucket,
    retrievalKey: hashedRetrievalKey,
    retrievalKeyIsCaseSensitive
  })

  return fileId
}

/**
 * Creates a repeater CSV file from submission data
 * @param {SubmitRecordset} repeater - Repeater form data
 * @param {string} hashedRetrievalKey - Hashed retrieval key
 * @param {boolean} retrievalKeyIsCaseSensitive - Whether retrieval key is case sensitive
 * @returns {Promise<{name: string, fileId: string}>} Repeater result
 */
export async function createRepeaterCsvFile(
  repeater,
  hashedRetrievalKey,
  retrievalKeyIsCaseSensitive
) {
  /** @type {string[]} */
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
  const contentType = 'text/csv'

  await createS3File(fileKey, csv, contentType, getS3Client())

  await repository.create({
    fileId,
    filename: `${fileId}.csv`,
    contentType,
    s3Key: fileKey,
    s3Bucket,
    retrievalKey: hashedRetrievalKey,
    retrievalKeyIsCaseSensitive
  })

  return { name: repeater.name, fileId }
}

/**
 * Processes repeater files and handles failures
 * @param {SubmitRecordset[]} repeaters - Array of repeater data
 * @param {string} hashedRetrievalKey - Hashed retrieval key
 * @param {boolean} retrievalKeyIsCaseSensitive - Whether retrieval key is case sensitive
 * @returns {Promise<Record<string, string>>} Map of repeater names to file IDs
 */
export async function processRepeaterFiles(
  repeaters,
  hashedRetrievalKey,
  retrievalKeyIsCaseSensitive
) {
  const repeaterResults = await Promise.allSettled(
    repeaters.map((repeater) =>
      createRepeaterCsvFile(
        repeater,
        hashedRetrievalKey,
        retrievalKeyIsCaseSensitive
      )
    )
  )

  const fulfilled = repeaterResults.filter(
    (result) => result.status === 'fulfilled'
  )

  if (fulfilled.length !== repeaterResults.length) {
    throw Boom.internal('Failed to save repeater files')
  }

  return Object.fromEntries(
    fulfilled.map((result) => [result.value.name, result.value.fileId])
  )
}

/**
 * @import { SubmitRecordset } from '@defra/forms-model'
 */
