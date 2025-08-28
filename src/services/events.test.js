import {
  SubmissionEventMessageCategory,
  SubmissionEventMessageSource,
  SubmissionEventMessageType
} from '@defra/forms-model'
import { ValidationError } from 'joi'
import { pino } from 'pino'

import { prepareDb } from '~/src/mongo.js'
import {
  buildMessage,
  rawMessageDelivery
} from '~/src/repositories/__stubs__/save-and-exit.js'
import { mapSubmissionEvent } from '~/src/services/events.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/repositories/save-and-exit-repository.js')
jest.mock('~/src/messaging/event.js')

jest.mock('~/src/mongo.js', () => {
  let isPrepared = false

  return {
    get client() {
      if (!isPrepared) {
        return undefined
      }

      return {
        startSession: () => ({
          endSession: jest.fn().mockResolvedValue(undefined),
          withTransaction: jest.fn(
            /**
             * Mock transaction handler
             * @param {() => Promise<void>} fn
             */
            async (fn) => fn()
          )
        })
      }
    },

    prepareDb() {
      isPrepared = true
      return Promise.resolve()
    }
  }
})

describe('events', () => {
  beforeAll(async () => {
    await prepareDb(pino())
  })

  describe('mapSubmissionEvent', () => {
    /**
     *
     * @type {Message}
     */
    const submissionEventMessage = buildMessage({
      Body: rawMessageDelivery(
        true,
        '{\n     "entityId": "689b7ab1d0eeac9711a7fb33",\n     "category": "RUNNER",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n    "createdAt": "2025-07-23T00:00:00.000Z",\n  "data":  {\n       "formId": "689b7ab1d0eeac9711a7fb33",\n         "email": "my-email@test.com",\n         "security": {\n "question": "q1", "answer": "a3" },\n "state": {\n    "formField1": "val1",\n         "formField2": "val2" }\n       },\n     "schemaVersion": 1,\n     "type": "RUNNER_SAVE_AND_EXIT"\n,\n     "source": "FORMS_RUNNER"\n   }'
      ),
      MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
      MessageAttributes: {},
      MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
      ReceiptHandle:
        'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
    })

    it('should map the message', async () => {
      expect(await mapSubmissionEvent(submissionEventMessage)).toEqual({
        entityId: '689b7ab1d0eeac9711a7fb33',
        messageCreatedAt: expect.any(Date),
        recordCreatedAt: expect.any(Date),
        messageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        category: SubmissionEventMessageCategory.RUNNER,
        createdAt: new Date('2025-07-23T00:00:00.000Z'),
        data: {
          formId: '689b7ab1d0eeac9711a7fb33',
          email: 'my-email@test.com',
          security: {
            question: 'q1',
            answer: expect.any(String)
          },
          state: {
            formField1: 'val1',
            formField2: 'val2'
          }
        },
        schemaVersion: 1,
        type: SubmissionEventMessageType.RUNNER_SAVE_AND_EXIT,
        source: SubmissionEventMessageSource.FORMS_RUNNER
      })
    })

    it('should allow unknown fields the message', async () => {
      const event = await mapSubmissionEvent({
        ...submissionEventMessage,
        // @ts-expect-error - unknown field
        unknownField: 'visible'
      })
      // @ts-expect-error - unknown field for testing
      expect(event.unknownField).toBeUndefined()
    })

    it('should fail if there is no MessageId', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { MessageId, ...auditEventMessageWithoutMessageId } =
        submissionEventMessage

      await expect(
        mapSubmissionEvent(auditEventMessageWithoutMessageId)
      ).rejects.toThrow(new Error('Unexpected missing Message.MessageId'))
    })

    it('should fail if there is no Body', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { Body, ...auditEventMessageWithoutBody } = submissionEventMessage

      await expect(
        mapSubmissionEvent(auditEventMessageWithoutBody)
      ).rejects.toThrow(new Error('Unexpected empty Message.Body'))
    })

    it('should fail if the message is invalid', async () => {
      /**
       *
       * @type {Message}
       */
      const submissionEventMessage = buildMessage({
        Body: rawMessageDelivery(
          true,
          '{\n     "entityId": "689b7ab1d0eeac9711a7fb33",\n     "category": "RUNNER",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "data":  {\n       "formId": "689b7ab1d0eeac9711a7fb33",\n         "email": "my-email@test.com",\n         "security": {\n "question": "q1", "answer": "a3" },\n "state": {\n    "formField1": "val1",\n         "formField2": "val2" }\n       },\n     "schemaVersion": 1,\n     "type": "RUNNER_SAVE_AND_EXIT"\n,\n     "source": "FORMS_RUNNER"\n   }'
        ),
        MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
        MessageAttributes: {},
        MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        ReceiptHandle:
          'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
      })

      await expect(mapSubmissionEvent(submissionEventMessage)).rejects.toThrow(
        new ValidationError(
          '"createdAt" is required',
          [],
          submissionEventMessage
        )
      )
    })
  })
})

/**
 * @import {Message} from '@aws-sdk/client-sqs'
 */
