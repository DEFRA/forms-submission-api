import { formAdapterSubmissionMessagePayloadSchema } from '@defra/forms-engine-plugin/engine/types/schema.js'
import { FormStatus } from '@defra/forms-model'
import Joi from 'joi'

export const magicLinkSchema = Joi.string().uuid().required()

// The preview state of a form. A request with no value is for the live form.
export const previewSchema = Joi.string()
  .valid(FormStatus.Draft, FormStatus.Live)
  .optional()

// Response schemas
export const formSubmitResponseSchema = Joi.object({
  main: Joi.string().required(),
  repeaters: Joi.array()
    .items(Joi.object().label('formRepeater'))
    .label('formRepeaters')
}).label('formSubmitResponse')

export const getSavedLinkResponseSchema = Joi.object({
  form: {
    id: Joi.string().required(),
    status: Joi.string(),
    isPreview: Joi.boolean().required(),
    baseUrl: Joi.string().required()
  },
  authType: Joi.string().valid('citizenSignIn', 'memorableWord').required(),
  question: Joi.string().optional(),
  invalidPasswordAttempts: Joi.number().min(0).optional()
}).label('getSavedLinkResponse')

export const getSaveAndExitRecordsResponseSchema = Joi.array()
  .items(
    Joi.object({
      magicLinkId: Joi.string().required(),
      referenceNumber: Joi.string().optional(),
      formTitle: Joi.string().optional(),
      createdAt: Joi.date().required(),
      expireAt: Joi.date().required()
    }).label('saveAndExitRecord')
  )
  .label('getSaveAndExitRecordsResponse')

export const getSaveAndExitRecordResponseSchema = Joi.object({
  state: Joi.object().required(),
  magicLinkGroupId: Joi.string().optional()
}).label('getSaveAndExitRecordResponse')

export const getSavedLinkGoneSchema = Joi.object({
  output: {
    payload: {
      latestId: Joi.string().required()
    }
  }
}).label('getSavedLinkGoneResponse')

export const validateSavedLinkResponseSchema = Joi.object({
  form: {
    id: Joi.string().required(),
    status: Joi.string(),
    isPreview: Joi.boolean().required(),
    baseUrl: Joi.string().required()
  },
  state: Joi.object(),
  securityQuestion: Joi.string().required(),
  invalidPasswordAttempts: Joi.number().min(0).required(),
  validPassword: Joi.boolean().required(),
  magicLinkGroupId: Joi.string().required()
}).label('validateSavedLinkResponse')

export const generateFormSubmissionsFileResponseSchema = Joi.object({
  message: Joi.string().required()
}).label('generateFormSubmissionsFileResponse')

export const generateFeedbackSubmissionsFileResponseSchema = Joi.object({
  message: Joi.string().required()
}).label('generateFeedbackSubmissionsFileResponse')

export const resetSaveAndExitLinkResponseSchema = Joi.object({
  recordFound: Joi.boolean().required(),
  recordUpdated: Joi.boolean().required()
}).label('resetSaveAndExitLinkResponseSchema')

/**
 * @type {Joi.ObjectSchema<FormSubmissionDocument>}
 */
export const getSubmissionByReferenceResponseSchema = Joi.object()
  .keys({
    _id: Joi.string().hex().required(),
    recordCreatedAt: Joi.string().isoDate().required(),
    expireAt: Joi.string().isoDate().required()
  })
  .concat(formAdapterSubmissionMessagePayloadSchema)
  .label('getSubmissionByReferenceResponseSchema')

export const generateReportTimelineResponseSchema = Joi.object({
  timeline: Joi.array().items({
    type: Joi.string().required(),
    formId: Joi.string().required(),
    formStatus: Joi.string().required(),
    metricName: Joi.string().required(),
    metricValue: Joi.number().required(),
    createdAt: Joi.date().required()
  })
}).label('generateReportTimelineResponse')

/**
 * @type {Joi.StringSchema<string>}
 */
export const generateReferenceNumberResponseSchema = Joi.string().label(
  'generateReferenceNumberResponseSchema'
)

/**
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
export const dqlSchema = Joi.string().valid('form-submissions', 'save-and-exit')

export const messageIdSchema = Joi.string()
