import Joi from 'joi'

export const magicLinkSchema = Joi.string().uuid().required()
