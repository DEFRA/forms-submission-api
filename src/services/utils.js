import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { stringify } from 'csv-stringify'

import { config } from '~/src/config/index.js'

const awsRegion = config.get('awsRegion')
const s3Bucket = config.get('s3Bucket')

/**
 * @param {Input} input
 * @returns {Promise<string>}
 */
export function createCsv(input) {
  return new Promise((resolve, reject) => {
    stringify(
      input,
      { bom: true },
      /** @type {Callback} */ function (err, output) {
        if (err) {
          reject(err instanceof Error ? err : new Error('CSV stringify error'))
          return
        }

        resolve(Buffer.from(output, 'utf8').toString())
      }
    )
  })
}

/**
 * Create a file in S3.
 * @param {string} key - the key of the file
 * @param {string | Buffer} body - file body
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

/** @type {S3Client | undefined} */
let s3Client

/**
 * Retrieves a shared S3 client, creating it on first use.
 * Reusing a single client lets the AWS SDK reuse its connection pool
 * and credentials instead of paying that cost on every file operation.
 * @returns {S3Client}
 */
export function getS3Client() {
  s3Client ??= new S3Client({
    region: awsRegion,
    ...(config.get('s3Endpoint') && {
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: true
    })
  })

  return s3Client
}

/**
 * @import { Input, Callback } from 'csv-stringify'
 */
