/* istanbul ignore file */
import {
  FormStatus,
  SecurityQuestionsEnum,
  SubmissionEventMessageCategory,
  SubmissionEventMessageSchemaVersion,
  SubmissionEventMessageSource,
  SubmissionEventMessageType
} from '@defra/forms-model'

import { addDays } from '~/src/helpers/date-helper.js'

export const STUB_SAVE_AND_EXIT_RECORD_ID = '68948579d5659369f1e634c6'

/**
 * @param {Partial<SaveAndExitMessage>} partialSaveAndExitMessage
 * @param {string} [formId]
 * @returns {SaveAndExitMessage}
 */
export function buildSaveAndExitMessage(
  partialSaveAndExitMessage = {},
  formId
) {
  return {
    category: SubmissionEventMessageCategory.RUNNER,
    type: SubmissionEventMessageType.RUNNER_SAVE_AND_EXIT,
    schemaVersion: SubmissionEventMessageSchemaVersion.V1,
    source: SubmissionEventMessageSource.FORMS_RUNNER,
    createdAt: new Date('2025-08-07T10:52:22.236Z'),
    messageCreatedAt: new Date('2025-08-07T10:52:22.246Z'),
    data: {
      form: {
        id: formId ?? '688131eeff67f889d52c66cc',
        title: 'My FirstForm',
        status: FormStatus.Draft,
        isPreview: false,
        baseUrl: 'http://localhost:3009'
      },
      email: 'my-email@test.com',
      security: {
        question: SecurityQuestionsEnum.MemorablePlace,
        answer: 'a2'
      },
      state: {
        formField1: 'val1',
        formField2: 'val2'
      }
    },
    ...partialSaveAndExitMessage
  }
}

/**
 * @param {boolean} isRawMessage
 * @param {string} body
 * @returns {string}
 */
export function rawMessageDelivery(isRawMessage, body) {
  if (isRawMessage) {
    return body
  }
  return JSON.stringify({
    Message: body
  })
}

/**
 * Builds a message from a Message Partial
 * @param {Partial<Message>} partialMessage
 * @returns {Message}
 */
export function buildMessage(partialMessage = {}) {
  return {
    Body: rawMessageDelivery(
      true,
      '{\n     "_id": "689b7ab1d0eeac9711a7fb33",\n     "category": "RUNNER",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "form": {\n "id": "689b7ab1d0eeac9711a7fb33",\n    "title": "my-first-form",  \n   "slug": "my-first-form",   \n  "isPreview": false,   \n.  "status": "draft". \n  },  "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.uk",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
    ),
    MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
    MessageAttributes: {},
    MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
    ReceiptHandle:
      'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ=',
    ...partialMessage
  }
}

/**
 * Builds a message from a Message Partial and AuditMessage
 * @param {SaveAndExitMessage} saveAndExitMessage
 * @param {Partial<Message>} partialMessage
 * @returns {Message}
 */
export function buildMessageFromRunnerMessage(
  saveAndExitMessage,
  partialMessage = {}
) {
  const Body = JSON.stringify(saveAndExitMessage)

  return {
    ...buildMessage(partialMessage),
    Body
  }
}

/**
 * @returns {WithId<SaveAndExitDocument>}
 */
export function buildDbDocument() {
  return /** @type {WithId<SaveAndExitDocument>} */ ({
    magicLinkId: 'magic-id',
    form: {
      id: 'form-id',
      status: 'draft',
      isPreview: false,
      baseUrl: 'http://localhost:3009'
    },
    email: 'my-email@test.com',
    security: {
      question: SecurityQuestionsEnum.MemorablePlace,
      answer: 'a5'
    },
    state: {
      formField1: 'val1',
      formField2: 'val2'
    },
    invalidPasswordAttempts: 0,
    createdAt: new Date(),
    expireAt: addDays(new Date(), 28)
  })
}

/**
 * @import { WithId } from 'mongodb'
 * @import { SaveAndExitMessage, } from '@defra/forms-model'
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { SaveAndExitDocument } from '~/src/api/types.js'
 */
