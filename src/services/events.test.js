import {
  SubmissionEventMessageCategory,
  SubmissionEventMessageSource,
  SubmissionEventMessageType
} from '@defra/forms-model'
import { ValidationError } from 'joi'
import { pino } from 'pino'

import { deleteEventMessage } from '~/src/messaging/event.js'
import { prepareDb } from '~/src/mongo.js'
import {
  buildMessage,
  buildMessageFromRunnerMessage,
  buildSaveAndExitMessage,
  buildSubmissionMetaBase,
  rawMessageDelivery
} from '~/src/repositories/__stubs__/save-and-exit.js'
import { createSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'
import {
  mapSubmissionEvent,
  processSubmissionEvents
} from '~/src/services/events.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/repositories/save-and-exit-repository.js')

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

  describe('processSubmissionEvents', () => {
    const messageId1 = '01267dd5-8cc7-4749-9802-40190f6429eb'
    const messageId2 = '5dd16f40-6118-4797-97c9-60a298c9a898'
    const messageId3 = '70c0155c-e9a9-4b90-a45f-a839924fca65'

    const recordInput1 = buildSubmissionMetaBase({
      recordCreatedAt: new Date('2025-08-08'),
      messageId: messageId1
    })
    const recordInput2 = buildSubmissionMetaBase({
      recordCreatedAt: new Date('2025-09-09'),
      messageId: messageId2
    })
    const recordInput3 = buildSubmissionMetaBase({
      recordCreatedAt: new Date('2025-10-10'),
      messageId: messageId3
    })

    const entityId1 = '542ba433-f07a-4e02-8d2f-8a0ba719fb24'
    const entityId2 = 'dc11160e-8d8c-4151-a70a-080a08ef6622'
    const entityId3 = '4d6dc877-83ef-475b-a591-5b1709d634dd'
    const saveAndExitMessage1 = buildSaveAndExitMessage({ entityId: entityId1 })
    const saveAndExitMessage2 = buildSaveAndExitMessage({ entityId: entityId2 })
    const saveAndExitMessage3 = buildSaveAndExitMessage({ entityId: entityId3 })
    const message1 = buildMessageFromRunnerMessage(saveAndExitMessage1, {
      MessageId: messageId1
    })
    const message2 = buildMessageFromRunnerMessage(saveAndExitMessage2, {
      MessageId: messageId2
    })
    const message3 = buildMessageFromRunnerMessage(saveAndExitMessage3, {
      MessageId: messageId3
    })
    const message4 = buildMessageFromRunnerMessage(saveAndExitMessage1, {
      MessageId: messageId1
    })
    const message5 = buildMessageFromRunnerMessage(saveAndExitMessage2, {
      MessageId: messageId2
    })
    const message6 = buildMessageFromRunnerMessage(saveAndExitMessage3, {
      MessageId: messageId3
    })
    const messages = [message1, message2, message3]
    const messages2 = [message4, message5, message6]

    it('should create a list of audit events', async () => {
      const expectedMapped1 = {
        ...saveAndExitMessage1,
        ...recordInput1,
        recordCreatedAt: expect.any(Date),
        messageId: messageId1
      }
      expectedMapped1.data.security.answer = expect.any(String)
      expectedMapped1.entityId = expect.any(String)

      const expectedMapped2 = {
        ...saveAndExitMessage2,
        ...recordInput2,
        recordCreatedAt: expect.any(Date),
        messageId: messageId2
      }
      expectedMapped2.data.security.answer = expect.any(String)
      expectedMapped2.entityId = expect.any(String)

      const expectedMapped3 = {
        ...saveAndExitMessage3,
        ...recordInput3,
        recordCreatedAt: expect.any(Date),
        messageId: messageId3
      }
      expectedMapped3.data.security.answer = expect.any(String)
      expectedMapped3.entityId = expect.any(String)

      const result = await processSubmissionEvents(messages)
      expect(createSaveAndExitRecord).toHaveBeenCalledTimes(3)
      expect(createSaveAndExitRecord).toHaveBeenCalledWith(
        expectedMapped1,
        expect.anything()
      )
      expect(createSaveAndExitRecord).toHaveBeenCalledWith(
        expectedMapped2,
        expect.anything()
      )
      expect(createSaveAndExitRecord).toHaveBeenCalledWith(
        expectedMapped3,
        expect.anything()
      )
      expect(deleteEventMessage).toHaveBeenCalledTimes(3)
      expect(deleteEventMessage).toHaveBeenCalledWith(message1)
      expect(deleteEventMessage).toHaveBeenCalledWith(message2)
      expect(deleteEventMessage).toHaveBeenCalledWith(message3)

      expect(result).toEqual({
        processed: messages,
        failed: []
      })
    })

    it('should handle failures', async () => {
      jest.mocked(createSaveAndExitRecord).mockResolvedValueOnce(undefined)
      jest
        .mocked(createSaveAndExitRecord)
        .mockRejectedValueOnce(new Error('error in create'))
      jest.mocked(createSaveAndExitRecord).mockResolvedValueOnce(undefined)
      jest.mocked(deleteEventMessage).mockResolvedValueOnce({
        $metadata: { httpStatusCode: 200 }
      })
      jest
        .mocked(deleteEventMessage)
        .mockRejectedValueOnce(new Error('error in delete'))
      const result = await processSubmissionEvents(messages2)

      expect(result).toEqual({
        processed: expect.any(Array),
        failed: expect.any(Array)
      })

      expect(result.processed).toHaveLength(1)
      expect(result.failed).toHaveLength(2)
      expect(result.failed).toContainEqual(new Error('error in create'))
      expect(result.failed).toContainEqual(new Error('error in delete'))
    })
  })
})

/**
 * @import {Message} from '@aws-sdk/client-sqs'
 */
