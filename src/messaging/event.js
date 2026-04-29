import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { sqsClient } from '~/src/tasks/sqs.js'

export const receiveMessageTimeout = config.get('receiveMessageTimeout')

const maxNumberOfMessages = config.get('maxNumberOfMessages')
const visibilityTimeout = config.get('visibilityTimeout')

/**
 * @param {string} dlqName
 */
function getDeadLetterQueueUrl(dlqName) {
  return dlqName === 'save-and-exit'
    ? `${config.get('saveAndExitQueueUrl')}-deadletter`
    : `${config.get('submissionQueueUrl')}-deadletter`
}

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
 * Receive dead-letter queue messages
 * @param {string} dlq - the SQS deadletter queue identifier
 * @returns {Promise<ReceiveMessageResult>}
 */
export function receiveDlqMessages(dlq) {
  const queueUrl = getDeadLetterQueueUrl(dlq)
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    VisibilityTimeout: 0,
    WaitTimeSeconds: 0
  })
  return sqsClient.send(command)
}

/**
 * Redrive all messages from the dead-letter queue to the main queue
 * @param {string} dlq - the SQS deadletter queue ARN
 * @returns {Promise<StartMessageMoveTaskResult>}
 */
export function redriveDlqMessages(dlq) {
  const queueArn =
    dlq === 'save-and-exit'
      ? config.get('sqsSaveAndExitDlqArn')
      : config.get('sqsFormSubmissionsDlqArn')
  const command = new StartMessageMoveTaskCommand({
    SourceArn: queueArn
  })
  return sqsClient.send(command)
}

/**
 * Delete DLQ message by messageId
 * This has to be done as a combined 'read then delete' (while using a visibility timeout of non-zero)
 * otherwise the receipt handles become stale and the delete operation doesn't work.
 * @param {string} dlq - the SQS deadletter queue ARN
 * @param {string} messageId
 */
export async function deleteDlqMessage(dlq, messageId) {
  const queueUrl = getDeadLetterQueueUrl(dlq)
  const receiveCommand = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    VisibilityTimeout: 2,
    WaitTimeSeconds: 0
  })
  const messageResponse = await sqsClient.send(receiveCommand)

  const messages = messageResponse.Messages
    ? messageResponse.Messages.filter((m) => m.MessageId === messageId)
    : undefined
  if (!messages?.length) {
    const errorText = `Message with id ${messageId} not found in submissions-api (${dlq}) DLQ`
    logger.info(errorText)
    throw new Error(errorText)
  }

  logger.info(
    `[DLQ] Number of messages found with id ${messageId}: ${messages.length}`
  )
  for (const message of messages) {
    const deleteCommand = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: message.ReceiptHandle
    })
    logger.info(`[DLQ] Deleting message with id ${messageId}`)
    await sqsClient.send(deleteCommand)
    logger.info(`[DLQ] Deleted message with id ${messageId}`)
  }
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
 * @import { ReceiveMessageCommandInput, ReceiveMessageResult, DeleteMessageCommandOutput, Message, StartMessageMoveTaskResult } from '@aws-sdk/client-sqs'
 */
