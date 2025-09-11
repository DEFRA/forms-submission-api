import Joi from 'joi'

export const magicLinkSchema = Joi.string().uuid().required()

// Response schemas
export const formSubmitResponseSchema = Joi.object({
  main: Joi.string().required(),
  repeaters: Joi.array().items(Joi.object())
}).label('formSubmitResponse')

export const getSavedLinkResponseSchema = Joi.object({
  form: {
    id: Joi.string().required(),
    status: Joi.string(),
    isPreview: Joi.boolean().required(),
    baseUrl: Joi.string().required()
  },
  question: Joi.string().required(),
  invalidPasswordAttempts: Joi.number().min(0).required()
}).label('getSavedLinkResponse')

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
  validPassword: Joi.boolean().required()
}).label('validateSavedLinkResponse')
