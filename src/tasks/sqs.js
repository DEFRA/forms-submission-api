import { SQSClient } from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'

const awsRegion = config.get('awsRegion')
const sqsEndpoint = config.get('sqsEndpoint')

/**
 * Gets the SQS Client
 * @returns {SQSClient}
 */
export function getSQSClient() {
  return new SQSClient({
    region: awsRegion,
    endpoint: sqsEndpoint
  })
}

export const sqsClient = getSQSClient()
