import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'

import 'aws-sdk-client-mock-jest'
import {
  deleteDlqMessage,
  deleteMessage,
  receiveDlqMessages,
  receiveMessages,
  redriveDlqMessages,
  resubmitDlqMessage
} from '~/src/messaging/event.js'

jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}))

describe('event', () => {
  const snsMock = mockClient(SQSClient)
  const queueName = 'save-and-exit'
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
    it('should receive messages', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }
      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await expect(receiveMessages(queueName)).resolves.toEqual(receivedMessage)
    })
  })

  describe('deleteMessage', () => {
    it('should delete event message', async () => {
      /**
       * @type {DeleteMessageCommandOutput}
       */
      const deleteResult = {
        $metadata: {}
      }

      snsMock.on(DeleteMessageCommand).resolves(deleteResult)
      await deleteMessage(queueName, messageStub)
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: expect.any(String),
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
      await receiveDlqMessages(queueName)
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        VisibilityTimeout: 3,
        WaitTimeSeconds: 3
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
      await redriveDlqMessages(queueName)
      expect(snsMock).toHaveReceivedCommandWith(StartMessageMoveTaskCommand, {
        SourceArn: expect.any(String)
      })
    })
  })

  describe('deleteDlqMessage', () => {
    it('should delete event message', async () => {
      const receivedMessage = {
        Messages: [messageStub, messageStub, messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await deleteDlqMessage(queueName, messageStub.MessageId, 5, 2)
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 5,
        WaitTimeSeconds: 2
      })
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: expect.any(String),
        ReceiptHandle: receiptHandle
      })
    })

    it('should delete event message with default values', async () => {
      const receivedMessage = {
        Messages: [messageStub, messageStub, messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await deleteDlqMessage(queueName, messageStub.MessageId)
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 3,
        WaitTimeSeconds: 3
      })
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: expect.any(String),
        ReceiptHandle: receiptHandle
      })
    })

    it('should throw if message not found after max attempts', async () => {
      const receivedMessage = {
        Messages: []
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await expect(() =>
        deleteDlqMessage(queueName, messageStub.MessageId, 0, 0)
      ).rejects.toThrow(
        'Message with id 31cb6fff-8317-412e-8488-308d099034c4 not found in save-and-exit DLQ after 7 attempts'
      )
    }, 10000)
  })

  describe('resubmitDlqMessage', () => {
    it('should resubmit message to main queue', async () => {
      const sendMessage = {
        MessageId: '12345'
      }

      snsMock.on(SendMessageCommand).resolves(sendMessage)
      await resubmitDlqMessage(
        queueName,
        messageStub.MessageId,
        messageStub.Body
      )
      expect(snsMock).toHaveReceivedCommandWith(SendMessageCommand, {
        QueueUrl: expect.any(String),
        MessageBody: messageStub.Body
      })
    })

    it('should throw if resubmit fails', async () => {
      snsMock.on(SendMessageCommand).rejects('bad SQS command')
      await expect(() =>
        resubmitDlqMessage(queueName, messageStub.MessageId, messageStub.Body)
      ).rejects.toThrow('bad SQS command')
    })
  })
})

/**
 * @import { DeleteMessageCommandOutput, StartMessageMoveTaskCommandOutput } from '@aws-sdk/client-sqs'
 */
