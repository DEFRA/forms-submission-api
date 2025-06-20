import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { stringify } from 'csv-stringify'

import { config } from '~/src/config/index.js'

const s3Region = config.get('s3Region')
const s3Bucket = config.get('s3Bucket')

/**
 * @param {Input} input
 * @returns {Promise<string>}
 */
export function createCsv(input) {
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
 * Create a file in S3.
 * @param {string} key - the key of the file
 * @param {string} body - file body
 * @param {string} contentType - content type
 * @param {S3Client} client - S3 client
 */
export function createS3File(key, body, contentType, client) {
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
 * Retrieves an S3 client
 * @returns {S3Client}
 */
export function getS3Client() {
  return new S3Client({
    region: s3Region,
    ...(config.get('s3Endpoint') && {
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: true
    })
  })
}

/**
 * @import { Input, Callback } from 'csv-stringify'
 */
