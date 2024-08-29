import Joi from 'joi'

const fileUploadStatusSchema = Joi.object()
  .keys({
    fileId: Joi.string().required(),
    filename: Joi.string().required(),
    contentType: Joi.string().optional(),
    fileStatus: Joi.string().valid('complete').required(),
    contentLength: Joi.number().required(),
    checksumSha256: Joi.string().optional(),
    detectedContentType: Joi.string().optional(),
    s3Key: Joi.string().required(),
    s3Bucket: Joi.string().required(),
    hasError: Joi.boolean().optional(),
    errorMessage: Joi.string().optional()
  })
  .required()
  .unknown(true)

// below we use .unknown(true) as extras don't need to be a show stopper
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

export const fileRetrievalParamsSchema = Joi.object()
  .keys({
    fileId: Joi.string().required()
  })
  .required()

export const fileAccessPayloadSchema = Joi.object()
  .keys({
    fileId: Joi.string().required(),
    retrievalKey: Joi.string().required()
  })
  .required()

export const filePersistPayloadSchema = Joi.object()
  .keys({
    files: Joi.array()
      .items(
        Joi.object({
          fileId: Joi.string().required(),
          initiatedRetrievalKey: Joi.string().required()
        })
      )
      .max(1000) // to prevent any malicious users but not any legitimate users
      .required(),
    persistedRetrievalKey: Joi.string().required()
  })
  .required()
