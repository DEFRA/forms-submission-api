import {
  SecurityQuestionsEnum,
  SubmissionEventMessageCategory,
  SubmissionEventMessageSource,
  SubmissionEventMessageType
} from '@defra/forms-model'
import { ValidationError } from 'joi'
import { pino } from 'pino'

import { deleteMessage } from '~/src/messaging/event.js'
import { prepareDb } from '~/src/mongo.js'
import {
  buildMessage,
  buildMessageFromRunnerMessage,
  buildSaveAndExitMessage,
  rawMessageDelivery
} from '~/src/repositories/__stubs__/save-and-exit.js'
import { createSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'
import {
  mapSaveAndExitMessageToData,
  processSaveAndExitEvents
} from '~/src/services/save-and-exit-events.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/repositories/save-and-exit-repository.js')
jest.mock('~/src/services/notify.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  })
}))

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
        '{\n     "_id": "689b7ab1d0eeac9711a7fb33",\n     "category": "RUNNER",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n    "createdAt": "2025-07-23T00:00:00.000Z",\n  "data":  {\n       "form": {\n "id": "689b7ab1d0eeac9711a7fb33",\n "title": "My First Form", \n "isPreview": false, \n "status": "draft", \n "baseUrl": "http://localhost:3009" },\n      "email": "my-email@test.com",\n         "security": {\n "question": "memorable-place", "answer": "a3" },\n "state": {\n    "formField1": "val1",\n         "formField2": "val2" }\n       },\n     "schemaVersion": 1,\n     "type": "RUNNER_SAVE_AND_EXIT"\n,\n     "source": "FORMS_RUNNER"\n   }'
      ),
      MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
      MessageAttributes: {},
      MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
      ReceiptHandle:
        'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
    })

    it('should map the message to data', async () => {
      expect(await mapSaveAndExitMessageToData(submissionEventMessage)).toEqual(
        {
          messageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
          parsedContent: {
            messageCreatedAt: expect.any(Date),
            category: SubmissionEventMessageCategory.RUNNER,
            createdAt: new Date('2025-07-23T00:00:00.000Z'),
            data: {
              form: {
                id: '689b7ab1d0eeac9711a7fb33',
                title: 'My First Form',
                isPreview: false,
                status: 'draft',
                baseUrl: 'http://localhost:3009'
              },
              email: 'my-email@test.com',
              security: {
                question: SecurityQuestionsEnum.MemorablePlace,
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
          }
        }
      )
    })

    it('should allow unknown fields the message', async () => {
      const event = await mapSaveAndExitMessageToData({
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
        mapSaveAndExitMessageToData(auditEventMessageWithoutMessageId)
      ).rejects.toThrow(new Error('Unexpected missing Message.MessageId'))
    })

    it('should fail if there is no Body', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { Body, ...auditEventMessageWithoutBody } = submissionEventMessage

      await expect(
        mapSaveAndExitMessageToData(auditEventMessageWithoutBody)
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
          '{\n     "_id": "689b7ab1d0eeac9711a7fb33",\n     "category": "RUNNER",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "data":  {\n       "formId": "689b7ab1d0eeac9711a7fb33",\n         "email": "my-email@test.com",\n         "security": {\n "question": "memorable-place", "answer": "a3" },\n "state": {\n    "formField1": "val1",\n         "formField2": "val2" }\n       },\n     "schemaVersion": 1,\n     "type": "RUNNER_SAVE_AND_EXIT"\n,\n     "source": "FORMS_RUNNER"\n   }'
        ),
        MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
        MessageAttributes: {},
        MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        ReceiptHandle:
          'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
      })

      await expect(
        mapSaveAndExitMessageToData(submissionEventMessage)
      ).rejects.toThrow(
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

    const formId1 = '542ba433-f07a-4e02-8d2f-8a0ba719fb24'
    const formId2 = 'dc11160e-8d8c-4151-a70a-080a08ef6622'
    const formId3 = '4d6dc877-83ef-475b-a591-5b1709d634dd'
    const saveAndExitMessage1 = buildSaveAndExitMessage({}, formId1)
    const saveAndExitMessage2 = buildSaveAndExitMessage({}, formId2)
    const saveAndExitMessage3 = buildSaveAndExitMessage({}, formId3)
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
        form: {
          id: '542ba433-f07a-4e02-8d2f-8a0ba719fb24',
          isPreview: false,
          status: 'draft',
          baseUrl: 'http://localhost:3009'
        },
        email: 'my-email@test.com',
        security: {
          answer: expect.any(String),
          question: 'memorable-place'
        },
        state: {
          formField1: 'val1',
          formField2: 'val2'
        },
        invalidPasswordAttempts: 0,
        magicLinkId: expect.any(String),
        createdAt: expect.any(Date)
      }

      const expectedMapped2 = {
        form: {
          id: '542ba433-f07a-4e02-8d2f-8a0ba719fb24',
          isPreview: false,
          status: 'draft',
          baseUrl: 'http://localhost:3009'
        },
        email: 'my-email@test.com',
        security: {
          answer: expect.any(String),
          question: 'memorable-place'
        },
        state: {
          formField1: 'val1',
          formField2: 'val2'
        },
        invalidPasswordAttempts: 0,
        magicLinkId: expect.any(String),
        createdAt: expect.any(Date)
      }

      const expectedMapped3 = {
        form: {
          id: '542ba433-f07a-4e02-8d2f-8a0ba719fb24',
          isPreview: false,
          status: 'draft',
          baseUrl: 'http://localhost:3009'
        },
        email: 'my-email@test.com',
        security: {
          answer: expect.any(String),
          question: 'memorable-place'
        },
        state: {
          formField1: 'val1',
          formField2: 'val2'
        },
        invalidPasswordAttempts: 0,
        magicLinkId: expect.any(String),
        createdAt: expect.any(Date)
      }

      const result = await processSaveAndExitEvents(messages)
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
      expect(deleteMessage).toHaveBeenCalledTimes(3)
      expect(deleteMessage).toHaveBeenCalledWith(expect.any(String), message1)
      expect(deleteMessage).toHaveBeenCalledWith(expect.any(String), message2)
      expect(deleteMessage).toHaveBeenCalledWith(expect.any(String), message3)

      expect(result).toEqual({
        processed: messages,
        failed: []
      })
    })

    it('should handle failures', async () => {
      // @ts-expect-error - record not found
      jest.mocked(createSaveAndExitRecord).mockResolvedValueOnce(undefined)
      jest
        .mocked(createSaveAndExitRecord)
        .mockRejectedValueOnce(new Error('error in create'))
      // @ts-expect-error - record not found
      jest.mocked(createSaveAndExitRecord).mockResolvedValueOnce(undefined)
      jest.mocked(deleteMessage).mockResolvedValueOnce({
        $metadata: { httpStatusCode: 200 }
      })
      jest
        .mocked(deleteMessage)
        .mockRejectedValueOnce(new Error('error in delete'))
      const result = await processSaveAndExitEvents(messages2)

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
