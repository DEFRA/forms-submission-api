/* istanbul ignore file */
import {
  SubmissionEventMessageCategory,
  SubmissionEventMessageSchemaVersion,
  SubmissionEventMessageSource,
  SubmissionEventMessageType
} from '@defra/forms-model'
import { ObjectId } from 'mongodb'

export const STUB_RECORD_CREATED_AT = new Date('2025-08-07T10:52:41.153Z')
export const STUB_MESSAGE_ID = '4564f91e-d348-419b-96c9-da2c88e82369'
export const STUB_SUBMISSION_RECORD_ID = '68948579d5659369f1e634c6'

/**
 * @param {Partial<RunnerRecordBase>} partialRunnerRecordBase
 * @returns {RunnerRecordBase}
 */
export function buildSubmissionMetaBase(partialRunnerRecordBase = {}) {
  return {
    recordCreatedAt: STUB_RECORD_CREATED_AT,
    messageId: STUB_MESSAGE_ID,
    ...partialRunnerRecordBase
  }
}

/**
 * @param {Partial<RunnerRecordInputMeta>} partialRunnerInputMeta
 * @returns {RunnerRecordInputMeta}
 */
export function buildSubmissionInputMeta(partialRunnerInputMeta = {}) {
  return {
    recordCreatedAt: STUB_RECORD_CREATED_AT,
    messageId: STUB_MESSAGE_ID,
    id: STUB_SUBMISSION_RECORD_ID,
    ...partialRunnerInputMeta
  }
}

/**
 * @param {Partial<WithId<RunnerRecordBase>>} partialSubmissionRecordDocumentMeta
 * @returns {WithId<RunnerRecordBase>}
 */
export function buildSubmissionRecordDocumentMeta(
  partialSubmissionRecordDocumentMeta = {}
) {
  return {
    recordCreatedAt: STUB_RECORD_CREATED_AT,
    messageId: STUB_MESSAGE_ID,
    _id: new ObjectId(STUB_SUBMISSION_RECORD_ID),
    ...partialSubmissionRecordDocumentMeta
  }
}

/**
 * @param {Partial<SaveAndExitMessage>} partialSaveAndExitMessage
 * @returns {SaveAndExitMessage}
 */
export function buildSaveAndExitMessage(partialSaveAndExitMessage = {}) {
  return {
    category: SubmissionEventMessageCategory.RUNNER,
    type: SubmissionEventMessageType.RUNNER_SAVE_AND_EXIT,
    schemaVersion: SubmissionEventMessageSchemaVersion.V1,
    source: SubmissionEventMessageSource.FORMS_RUNNER,
    entityId: '68836f68210543a49431e4b2',
    createdAt: new Date('2025-08-07T10:52:22.236Z'),
    messageCreatedAt: new Date('2025-08-07T10:52:22.246Z'),
    data: {
      formId: '688131eeff67f889d52c66cc',
      email: 'my-email@test.com',
      security: {
        question: 'q1',
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
 *
 * @param {SubmissionMessage} submissionMessage
 * @param {Partial<WithId<RunnerRecordBase>>} partialSubmissionDocumentMeta
 * @returns {WithId<RunnerRecordInput>}
 */
export function buildSubmissionRecordDocument(
  submissionMessage,
  partialSubmissionDocumentMeta
) {
  return {
    ...submissionMessage,
    ...buildSubmissionRecordDocumentMeta(partialSubmissionDocumentMeta)
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
      '{\n     "entityId": "689b7ab1d0eeac9711a7fb33",\n     "category": "RUNNER",\n     "messageCreatedAt": "2025-07-23T00:00:00.000Z",\n     "createdBy":  {\n       "displayName": "Enrique Chase",\n         "id": "83f09a7d-c80c-4e15-bcf3-641559c7b8a7"\n       },\n     "data":  {\n       "formId": "689b7ab1d0eeac9711a7fb33",\n         "organisation": "Defra",\n         "slug": "audit-form",\n         "teamEmail": "forms@example.uk",\n         "teamName": "Forms",\n         "title": "My Audit Event Form"\n       },\n     "schemaVersion": 1,\n     "type": "FORM_CREATED"\n,\n     "source": "FORMS_MANAGER"\n   }'
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
 * @param {SubmissionMessage} submissionMessage
 * @param {Partial<Message>} partialMessage
 * @returns {Message}
 */
export function buildMessageFromRunnerMessage(
  submissionMessage,
  partialMessage = {}
) {
  const Body = JSON.stringify(submissionMessage)

  return {
    ...buildMessage(partialMessage),
    Body
  }
}
/**
 * @import { WithId } from 'mongodb'
 * @import { RunnerRecordInput, SubmissionMessage, SaveAndExitMessage, RunnerRecordInputMeta, RunnerRecordBase } from '@defra/forms-model'
 * @import { Message } from '@aws-sdk/client-sqs'
 */
