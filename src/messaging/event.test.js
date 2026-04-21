import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  StartMessageMoveTaskCommand
} from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'

import 'aws-sdk-client-mock-jest'
import {
  deleteDlqMessage,
  deleteMessage,
  receiveDlqMessages,
  receiveMessages,
  redriveDlqMessages
} from '~/src/messaging/event.js'

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
    it('should receive dead-letter queue messages from form-submissions', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await receiveDlqMessages('form-submissions')
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        VisibilityTimeout: 0,
        WaitTimeSeconds: 0
      })
    })

    it('should receive dead-letter queue messages from save-and-exit', async () => {
      const receivedMessage = {
        Messages: [messageStub]
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await receiveDlqMessages('save-and-exit')
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        VisibilityTimeout: 0,
        WaitTimeSeconds: 0
      })
    })
  })

  describe('redriveDlqMessages', () => {
    it('should redrive dead-letter queue messages from form-submissions', async () => {
      /**
       * @type {StartMessageMoveTaskCommandOutput}
       */
      const redriveResult = {
        TaskHandle: '123',
        $metadata: {}
      }

      snsMock.on(StartMessageMoveTaskCommand).resolves(redriveResult)
      await redriveDlqMessages('form-submissions')
      expect(snsMock).toHaveReceivedCommandWith(StartMessageMoveTaskCommand, {
        SourceArn: expect.any(String)
      })
    })

    it('should redrive dead-letter queue messages from save-and-exit', async () => {
      /**
       * @type {StartMessageMoveTaskCommandOutput}
       */
      const redriveResult = {
        TaskHandle: '123',
        $metadata: {}
      }

      snsMock.on(StartMessageMoveTaskCommand).resolves(redriveResult)
      await redriveDlqMessages('save-and-exit')
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
      await deleteDlqMessage('save-and-exit', messageStub.MessageId)
      expect(snsMock).toHaveReceivedCommandWith(ReceiveMessageCommand, {
        QueueUrl: expect.any(String),
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 2,
        WaitTimeSeconds: 0
      })
      expect(snsMock).toHaveReceivedCommandWith(DeleteMessageCommand, {
        QueueUrl: expect.any(String),
        ReceiptHandle: receiptHandle
      })
    })

    it('should throw if message not found', async () => {
      const receivedMessage = {
        Messages: []
      }

      snsMock.on(ReceiveMessageCommand).resolves(receivedMessage)
      await expect(() =>
        deleteDlqMessage('save-and-exit', messageStub.MessageId)
      ).rejects.toThrow(
        'Message with id 31cb6fff-8317-412e-8488-308d099034c4 not found in submissions-api (save-and-exit) DLQ'
      )
    })
  })
})

/**
 * @import { DeleteMessageCommandOutput, StartMessageMoveTaskCommandOutput } from '@aws-sdk/client-sqs'
 */
