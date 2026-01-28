import { FormAdapterSubmissionSchemaVersion } from '@defra/forms-engine-plugin/engine/types/enums.js'
import { FormStatus } from '@defra/forms-model'

import { addDays } from '~/src/helpers/date-helper.js'

export const STUB_FORM_ID = '688131eeff67f889d52c66cc'
export const STUB_SUBMISSION_RECORD_ID = '68d284ef5fa1a0fb2ede066a'

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
    payments: {},
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
 * @import { WithId } from 'mongodb'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 * @import { FormAdapterSubmissionMessageResult, FormAdapterSubmissionMessagePayload, FormAdapterSubmissionMessageMeta, FormAdapterSubmissionMessageData } from '@defra/forms-engine-plugin/engine/types.js'
 */
