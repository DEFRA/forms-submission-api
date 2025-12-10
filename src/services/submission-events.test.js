import { pino } from 'pino'

import { deleteMessage } from '~/src/messaging/event.js'
import { prepareDb } from '~/src/mongo.js'
import { createSubmissionRecord } from '~/src/repositories/submission-repository.js'
import {
  mapSubmissionDataToDocument,
  mapSubmissionMessageToData,
  processSubmissionMessages
} from '~/src/services/submission-events.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/repositories/submission-repository.js')
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

  /**
   * @type {Message}
   */
  const submissionMessage = {
    Body: `{"meta":{"schemaVersion":1,"timestamp":"2025-11-14T10:42:05.534Z","referenceNumber":"121-6C2-5B4","formName":"My form","formId":"688131eeff67f889d52c66cc","formSlug":"my-form","status":"live","isPreview":false,"notificationEmail":"name@example.gov.uk","versionMetadata":{"versionNumber":36,"createdAt":"2025-10-16T13:54:59.512Z"}},"data":{"main":{"dGCWRr":"England","mpDPsu":{"day":13,"month":2,"year":1978},"qHKjBt":"Chocolate"},"repeaters":{},"files":{}},"result":{"files":{"main":"814b448c-c9f0-48ba-83f4-f5500df91cdc","repeaters":{}}}}`,
    MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
    MessageAttributes: {},
    MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
    ReceiptHandle:
      'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ='
  }

  describe('mapSubmissionMessageToData', () => {
    it('should map the message to data', () => {
      expect(mapSubmissionMessageToData(submissionMessage)).toEqual({
        messageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
        parsedContent: {
          meta: {
            schemaVersion: 1,
            timestamp: new Date('2025-11-14T10:42:05.534Z'),
            referenceNumber: '121-6C2-5B4',
            formName: 'My form',
            formId: '688131eeff67f889d52c66cc',
            formSlug: 'my-form',
            status: 'live',
            isPreview: false,
            notificationEmail: 'name@example.gov.uk',
            versionMetadata: {
              versionNumber: 36,
              createdAt: new Date('2025-10-16T13:54:59.512Z')
            }
          },
          data: {
            main: {
              dGCWRr: 'England',
              mpDPsu: {
                day: 13,
                month: 2,
                year: 1978
              },
              qHKjBt: 'Chocolate'
            },
            repeaters: {},
            files: {}
          },
          result: {
            files: {
              main: '814b448c-c9f0-48ba-83f4-f5500df91cdc',
              repeaters: {}
            }
          }
        }
      })
    })

    it('should fail if there is no MessageId', () => {
      const messageWithoutId = {
        ...submissionMessage,
        MessageId: undefined
      }
      expect(() => mapSubmissionMessageToData(messageWithoutId)).toThrow(
        'Unexpected missing Message.MessageId'
      )
    })

    it('should fail if there is no Body', () => {
      const messageWithoutId = {
        ...submissionMessage,
        Body: undefined
      }
      expect(() => mapSubmissionMessageToData(messageWithoutId)).toThrow(
        'Unexpected empty Message.Body'
      )
    })

    it('should fail if the message is invalid', () => {
      const messageWithInvalidBody = {
        ...submissionMessage,
        Body: '{}'
      }
      expect(() => mapSubmissionMessageToData(messageWithInvalidBody)).toThrow()
    })
  })

  describe('mapSubmissionDataToDocument', () => {
    it('should map successfully', () => {
      const messageData = mapSubmissionMessageToData(submissionMessage)

      expect(mapSubmissionDataToDocument(messageData)).toEqual({
        recordCreatedAt: expect.any(Date),
        expireAt: expect.any(Date),
        meta: {
          schemaVersion: 1,
          timestamp: new Date('2025-11-14T10:42:05.534Z'),
          referenceNumber: '121-6C2-5B4',
          formName: 'My form',
          formId: '688131eeff67f889d52c66cc',
          formSlug: 'my-form',
          status: 'live',
          isPreview: false,
          notificationEmail: 'name@example.gov.uk',
          versionMetadata: {
            versionNumber: 36,
            createdAt: new Date('2025-10-16T13:54:59.512Z')
          }
        },
        data: {
          main: {
            dGCWRr: 'England',
            mpDPsu: {
              day: 13,
              month: 2,
              year: 1978
            },
            qHKjBt: 'Chocolate'
          },
          repeaters: {},
          files: {}
        },
        result: {
          files: {
            main: '814b448c-c9f0-48ba-83f4-f5500df91cdc',
            repeaters: {}
          }
        }
      })
    })
  })

  describe('processSubmissionMessages', () => {
    const messages = [submissionMessage]

    it('should process submission message', async () => {
      const result = await processSubmissionMessages(messages)
      expect(createSubmissionRecord).toHaveBeenCalledTimes(1)
      expect(deleteMessage).toHaveBeenCalledTimes(1)

      expect(result).toEqual({
        processed: messages,
        failed: []
      })
    })

    it('should handle failures', async () => {
      jest
        .mocked(createSubmissionRecord)
        .mockRejectedValueOnce(new Error('error in create'))

      const result = await processSubmissionMessages(messages)

      expect(result).toEqual({
        processed: [],
        failed: [new Error('error in create')]
      })
    })
  })
})

/**
 * @import {Message} from '@aws-sdk/client-sqs'
 */
