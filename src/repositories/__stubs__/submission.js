import { FormAdapterSubmissionSchemaVersion } from '@defra/forms-engine-plugin/engine/types/enums.js'
import { FormStatus } from '@defra/forms-model'

import { addDays } from '~/src/helpers/date-helper.js'

export const STUB_SUBMISSION_RECORD_ID = '68948579d5659369f1e634c6'

/**
 * @returns {WithId<FormSubmissionDocument>}
 */
export function buildDbDocument() {
  return /** @type {WithId<FormSubmissionDocument>} */ ({
    ...buildFormAdapterSubmissionMessagePayloadStub(),
    recordCreatedAt: new Date(),
    expireAt: addDays(new Date(), 28)
  })
}

/**
 * @typedef {Omit<
 *   FormAdapterSubmissionMessageMeta,
 *   'schemaVersion' | 'timestamp' | 'status'
 * > & {
 *   schemaVersion: number
 *   status: string
 *   timestamp: string
 * }} FormAdapterSubmissionMessageMetaSerialised
 */

/**
 * @typedef {{
 *   meta: FormAdapterSubmissionMessageMetaSerialised
 *   data: FormAdapterSubmissionMessageData
 *   result: FormAdapterSubmissionMessageResult
 * }} FormAdapterSubmissionMessagePayloadSerialised
 */

/**
 * Builds a FormAdapterSubmissionMessageMeta stub - this is the metadata after de-serialisation
 * @param {Partial<FormAdapterSubmissionMessageMeta>} partialFormAdapterSubmissionMessageMeta
 * @returns {FormAdapterSubmissionMessageMeta}
 */
export function buildFormAdapterSubmissionMessageMetaStub(
  partialFormAdapterSubmissionMessageMeta = {}
) {
  return {
    schemaVersion: FormAdapterSubmissionSchemaVersion.V1,
    timestamp: new Date('2025-08-22T18:15:10.785Z'),
    referenceNumber: '576-225-943',
    formName: 'Order a pizza',
    formId: '68a8b0449ab460290c28940a',
    formSlug: 'order-a-pizza',
    status: FormStatus.Live,
    isPreview: false,
    notificationEmail: 'info@example.com',
    ...partialFormAdapterSubmissionMessageMeta
  }
}

/**
 * Builds a Form Submission Event Message stub - this is the event received over SQS
 * @param {Partial<FormAdapterSubmissionMessageMetaSerialised>} partialFormAdapterSubmissionMessageMetaSerialised
 * @returns {FormAdapterSubmissionMessageMetaSerialised}
 */
export function buildFormAdapterSubmissionMessageMetaSerialised(
  partialFormAdapterSubmissionMessageMetaSerialised = {}
) {
  return {
    schemaVersion: 1,
    timestamp: '2025-08-22T18:15:10.785Z',
    referenceNumber: '576-225-943',
    formName: 'Order a pizza',
    formId: '68a8b0449ab460290c28940a',
    formSlug: 'order-a-pizza',
    status: 'live',
    isPreview: false,
    notificationEmail: 'info@example.com',
    ...partialFormAdapterSubmissionMessageMetaSerialised
  }
}

/**
 * Builds a FormAdapterSubmissionMessageData stub
 * @param {Partial<FormAdapterSubmissionMessageData>} partialFormAdapterSubmissionMessageData
 * @returns {FormAdapterSubmissionMessageData}
 */
export function buildFormAdapterSubmissionMessageData(
  partialFormAdapterSubmissionMessageData = {}
) {
  return {
    main: {
      QMwMir: 'Roman Pizza',
      duOEvZ: 'Small',
      DzEODf: ['Mozzarella'],
      juiCfC: ['Pepperoni', 'Sausage', 'Onions', 'Basil'],
      YEpypP: 'None',
      JumNVc: 'Joe Bloggs',
      ALNehP: '+441234567890',
      vAqTmg: {
        addressLine1: '1 Anywhere Street',
        town: 'Anywhereville',
        postcode: 'AN1 2WH'
      },
      IbXVGY: {
        day: 22,
        month: 8,
        year: 2025
      },
      HGBWLt: ['Garlic sauce']
    },
    repeaters: {},
    files: {},
    ...partialFormAdapterSubmissionMessageData
  }
}

/**
 *
 * @param {Partial<FormAdapterSubmissionMessageResult>} partialFormAdapterSubmissionMessageResult
 * @returns {FormAdapterSubmissionMessageResult}
 */
export function buildFormAdapterSubmissionMessageResult(
  partialFormAdapterSubmissionMessageResult = {}
) {
  return {
    files: {
      main: '818d567d-ee05-4a7a-8c49-d5c54fb09b16',
      repeaters: {
        FqQrLz: 'e3005cd2-8b1c-4dc4-b2ac-bd1ff73666a9'
      }
    },
    ...partialFormAdapterSubmissionMessageResult
  }
}

/**
 * Builds a Form Submission Event Message stub
 * @param {Partial<FormAdapterSubmissionMessagePayload>} partialFormAdapterSubmissionMessagePayload
 * @returns {FormAdapterSubmissionMessagePayload}
 */
export function buildFormAdapterSubmissionMessagePayloadStub(
  partialFormAdapterSubmissionMessagePayload = {}
) {
  return {
    meta: buildFormAdapterSubmissionMessageMetaStub(),
    data: buildFormAdapterSubmissionMessageData(),
    result: buildFormAdapterSubmissionMessageResult(),
    ...partialFormAdapterSubmissionMessagePayload
  }
}

/**
 * Builds a Form Submission Event Message stub
 * @param {Partial<FormAdapterSubmissionMessagePayloadSerialised>} partialFormAdapterSubmissionMessagePayload
 * @returns {FormAdapterSubmissionMessagePayloadSerialised}
 */
export function buildFormAdapterSubmissionMessagePayloadSerialisedStub(
  partialFormAdapterSubmissionMessagePayload = {}
) {
  return {
    meta: buildFormAdapterSubmissionMessageMetaSerialised(),
    data: buildFormAdapterSubmissionMessageData(),
    result: buildFormAdapterSubmissionMessageResult(),
    ...partialFormAdapterSubmissionMessagePayload
  }
}

/**
 * @param {Partial<FormAdapterSubmissionMessage>} partialFormSubmissionMessage
 * @returns {FormAdapterSubmissionMessage}
 */
export function buildFormAdapterSubmissionMessage(
  partialFormSubmissionMessage = {}
) {
  return {
    ...buildFormAdapterSubmissionMessagePayloadStub(),
    messageId: '1668fba2-386c-4e2e-a348-a241e4193d08',
    recordCreatedAt: new Date('2025-08-26'),
    ...partialFormSubmissionMessage
  }
}

/**
 * SQS Message stub builder
 * @param {FormAdapterSubmissionMessagePayloadSerialised} messageBody
 * @param {Partial<Message>} message
 * @returns {Message}
 */
export function buildMessageStub(messageBody, message = {}) {
  return {
    Body: JSON.stringify(messageBody),
    MD5OfBody: 'a06ffc5688321b187cec5fdb9bcc62fa',
    MessageAttributes: {},
    MessageId: 'fbafb17e-86f0-4ac6-b864-3f32cd60b228',
    ReceiptHandle:
      'YTBkZjk3ZTAtODA4ZC00NTQ5LTg4MzMtOWY3NjA2MDJlMjUxIGFybjphd3M6c3FzOmV1LXdlc3QtMjowMDAwMDAwMDAwMDA6Zm9ybXNfYXVkaXRfZXZlbnRzIGZiYWZiMTdlLTg2ZjAtNGFjNi1iODY0LTNmMzJjZDYwYjIyOCAxNzUzMzU0ODY4LjgzMjUzMzQ=',
    ...message
  }
}

/**
 * @import { WithId } from 'mongodb'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 * @import { Message } from '@aws-sdk/client-sqs'
 * @import { FormAdapterSubmissionMessage, FormAdapterSubmissionMessageResult, FormAdapterSubmissionMessagePayload, FormAdapterSubmissionMessageMeta, FormAdapterSubmissionMessageData } from '@defra/forms-engine-plugin/engine/types.js'
 */
