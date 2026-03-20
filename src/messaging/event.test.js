import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'

import 'aws-sdk-client-mock-jest'
import {
  deleteMessage,
  receiveDlqMessages,
  receiveMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'

jest.mock('~/src/helpers/logging/logger.js')

describe('event', () => {
  const snsMock = mockClient(SQSClient)
  const queueUrl = 'http://example.com'
  const messageId = '31cb6fff-8317-412e-8488-308d099034c4'
  const receiptHandle = 'YzAwNzQ3MGMtZGY5Mi0'
  const messageStub = {
    Body: 'hello world',
    MD5OfBody: '9e5729d418a527676ab6807b35c6ffb1',
    MessageId: messageId,
    ReceiptHandle: receiptHandle
  }
  afterEach(() => {
    snsMock.reset()
  })
  describe('receiveEventMessages', () => {
    it('should send messages', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }
      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await expect(receiveMessages(queueUrl)).resolves.toEqual(receivedMessage)
    })
  })

  describe('deleteEventMessage', () => {
    it('should delete event message', async () => {
      /**
       * @type {DeleteMessageCommandOutput}
       */
      const deleteResult = {
        $metadata: {}
      }

      snsMock.on(DeleteMessageCommand).resolves(deleteResult)
      await deleteMessage(queueUrl, messageStub)
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle
      })
    })
  })

  describe('receiveDlqMessages', () => {
    it('should receive dead-letter queue messages', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await receiveDlqMessages('my-queue')
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        VisibilityTimeout: 5
      })
    })
  })

  describe('redriveDlqMessages', () => {
    it('should redrive dead-letter queue messages', async () => {
      /**
       * @type {StartMessageMoveTaskCommandOutput}
       */
      const redriveResult = {
        TaskHandle: '123',
        $metadata: {}
      }

      snsMock.on(StartMessageMoveTaskCommand).resolves(redriveResult)
      await redriveDlqMessages('my-arn')
      expect(snsMock).toHaveReceivedCommandWith(StartMessageMoveTaskCommand, {
        SourceArn: expect.any(String)
      })
    })
  })
})

/**
 * @import { DeleteMessageCommandOutput, StartMessageMoveTaskCommandOutput } from '@aws-sdk/client-sqs'
 */
