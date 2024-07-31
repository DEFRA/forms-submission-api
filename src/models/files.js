import Joi from 'joi'

const fileUploadStatusSchema = Joi.object()
  .keys({
    fileId: Joi.string().required(),
    filename: Joi.string().required(),
    contentType: Joi.string().required(),
    fileStatus: Joi.string().valid('complete').required(),
    contentLength: Joi.number().required(),
    checksumSha256: Joi.string().required(),
    detectedContentType: Joi.string().required(),
    s3Key: Joi.string().required(),
    s3Bucket: Joi.string().required(),
    hasError: Joi.boolean().optional(),
    errorMessage: Joi.string().optional()
  })
  .required()
  .unknown(true)

// below wse use .unknown(true) as extras don't need to be a show stopper
// just validate the bits we care about and let everything else through
export const fileIngestPayloadSchema = Joi.object()
  .keys({
    metadata: Joi.object({
      retrievalKey: Joi.string().required()
    })
      .required()
      .unknown(true),
    form: Joi.object()
      .keys({
        file: fileUploadStatusSchema
      })
      .required()
      .unknown(true)
  })
  .required()
  .unknown(true)
