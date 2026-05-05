import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { sqsClient } from '~/src/tasks/sqs.js'

export const receiveMessageTimeout = config.get('receiveMessageTimeout')

const maxNumberOfMessages = config.get('maxNumberOfMessages')
const pollingVisibilityTimeout = config.get('visibilityTimeout')

const MAX_RETRIES = 7
const RETRY_WAIT_BETWEEN_TRIES_IN_SECS = 1
const DEFAULT_VISIBILITY_TIMEOUT = 3
const DEFAULT_WAIT_TIME_IN_SECS = 3
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
    VisibilityTimeout: pollingVisibilityTimeout
  }

  const command = new ReceiveMessageCommand(input)
  return sqsClient.send(command)
}

/**
 * Receive dead-letter queue messages
 * @param {string} dlq - the SQS deadletter queue identifier
 * @returns {Promise<ReceiveMessageResult>}
 */
export function receiveDlqMessages(
  dlq,
  visibilityTimeout = DEFAULT_VISIBILITY_TIMEOUT,
  waitTimeSeconds = DEFAULT_WAIT_TIME_IN_SECS
) {
  const queueUrl = getDeadLetterQueueUrl(dlq)
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    VisibilityTimeout: visibilityTimeout,
    WaitTimeSeconds: waitTimeSeconds
  })
  return sqsClient.send(command)
}

/**
 * Get a specific message from the dead-letter queue. Handles retries if not found.
 * @param {string} dlq - the SQS deadletter queue identifier
 * @param {string} messageId
 * @param {number} [visibilityTimeout] - Queue visibilityTimeout
 * @param {number} [waitTimeSeconds] - Queue waitTimeSeconds
 * @returns {Promise< Message | null >}
 */
export async function getDlqMessage(
  dlq,
  messageId,
  visibilityTimeout = DEFAULT_VISIBILITY_TIMEOUT,
  waitTimeSeconds = DEFAULT_WAIT_TIME_IN_SECS
) {
  let attempts = 1

  while (attempts <= MAX_RETRIES) {
    const messageResponse = await receiveDlqMessages(
      dlq,
      visibilityTimeout,
      waitTimeSeconds
    )
    const messages = messageResponse.Messages ?? []
    for (const m of messages) {
      logger.info(
        `[DLQ] Received message with id ${m.MessageId} on attempt ${attempts}`
      )
    }

    const messageFound = messages.find((m) => m.MessageId === messageId)
    if (messageFound) {
      logger.info(
        `[DLQ] Found message with id ${messageId} on attempt ${attempts}`
      )
      return messageFound
    }

    logger.info(
      `[DLQ] Message ${messageId} not found in batch ${attempts}, retrying...`
    )

    await new Promise((resolve) =>
      setTimeout(resolve, RETRY_WAIT_BETWEEN_TRIES_IN_SECS * 1000)
    )

    attempts++
  }
  return null
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
 * Submit the specified message to the main queue
 * @param {string} dlq - the SQS deadletter queue identifier
 * @param {string} messageId
 * @param {string} messageJson
 */
export async function resubmitDlqMessage(dlq, messageId, messageJson) {
  try {
    logger.info(
      `[DLQ] Submitting new message in place of message id ${messageId}`
    )

    const command = new SendMessageCommand({
      QueueUrl: getDeadLetterQueueUrl(dlq),
      MessageBody: messageJson
    })
    const sendResult = await sqsClient.send(command)
    logger.info(
      `[DLQ] Submitting new message in place of message id ${messageId}. New message id is ${sendResult.MessageId}`
    )
  } catch (err) {
    logger.error(
      err,
      `[DLQ] Failed to submit new message to main queue based on old message of id ${messageId} from DLQ ${dlq}`
    )
    throw err
  }
}

/**
 * Delete DLQ message by messageId
 * This has to be done as a combined 'read then delete' (while using a visibility timeout of non-zero)
 * otherwise the receipt handle becomes stale and the delete operation doesn't work.
 * getDlqMessage uses retries in case the message is not always visibile when querying the DLQ.
 * @param {string} dlq - the SQS deadletter queue identifier
 * @param {string} messageId
 * @param {number} [visibilityTimeout] - Queue visibilityTimeout
 * @param {number} [waitTimeSeconds] - Queue waitTimeSeconds
 */
export async function deleteDlqMessage(
  dlq,
  messageId,
  visibilityTimeout = DEFAULT_VISIBILITY_TIMEOUT,
  waitTimeSeconds = DEFAULT_WAIT_TIME_IN_SECS
) {
  const foundMessage = await getDlqMessage(
    dlq,
    messageId,
    visibilityTimeout,
    waitTimeSeconds
  )
  if (!foundMessage) {
    const errorText = `Message with id ${messageId} not found in ${dlq} DLQ after ${MAX_RETRIES} attempts`
    logger.info(errorText)
    throw new Error(errorText)
  }

  const deleteCommand = new DeleteMessageCommand({
    QueueUrl: getDeadLetterQueueUrl(dlq),
    ReceiptHandle: foundMessage.ReceiptHandle
  })
  logger.info(`[DLQ] Deleting message with id ${messageId}`)
  await sqsClient.send(deleteCommand)
  logger.info(`[DLQ] Deleted message with id ${messageId}`)
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
