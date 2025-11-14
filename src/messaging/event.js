import {
  DeleteMessageCommand,
  ReceiveMessageCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { sqsClient } from '~/src/tasks/sqs.js'

export const receiveMessageTimeout = config.get('receiveMessageTimeout')

const maxNumberOfMessages = config.get('maxNumberOfMessages')
const visibilityTimeout = config.get('visibilityTimeout')

/**
 * Receive event messages
 * @param {string} queueUrl - the SQS queue url
 * @returns {Promise<ReceiveMessageResult>}
 */
export function receiveMessages(queueUrl) {
  /**
   * @type {ReceiveMessageCommandInput}
   */
  const input = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxNumberOfMessages,
    VisibilityTimeout: visibilityTimeout
  }

  const command = new ReceiveMessageCommand(input)
  return sqsClient.send(command)
}

/**
 * Delete event message
 * @param {string} queueUrl - the SQS queue url
 * @param {Message} message - the received message
 * @returns {Promise<DeleteMessageCommandOutput>}
 */
export function deleteMessage(queueUrl, message) {
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: message.ReceiptHandle
  })

  return sqsClient.send(command)
}

/**
 * @import { ReceiveMessageCommandInput, ReceiveMessageResult, DeleteMessageCommandOutput, Message } from '@aws-sdk/client-sqs'
 */
