/**
 * Form API request types
 * @typedef {Request<{ Server: { db: Db }, Params: FormByIdInput }>} RequestFormById
 * @typedef {Request<{ Server: { db: Db }, Params: FormBySlugInput }>} RequestFormBySlug
 * @typedef {Request<{ Server: { db: Db }, Params: FormByIdInput, Payload: FormDefinition }>} RequestFormDefinition
 * @typedef {Request<{ Server: { db: Db }, Payload: FormMetadataInput }>} RequestFormMetadataCreate
 * @typedef {Request<{ Server: { db: Db }, Params: FormByIdInput, Payload: { force: boolean }}>} RequestRemoveFormById
 * @typedef {Request<{ Server: { db: Db }, Params: FormByIdInput, Payload: Partial<FormMetadataInput> }>} RequestFormMetadataUpdateById
 */

/**
 * @template {import('@hapi/hapi').ReqRef} [ReqRef=import('@hapi/hapi').ReqRefDefaults]
 * @typedef {import('@hapi/hapi').Request<ReqRef>} Request
 */

/**
 * @typedef {import('@defra/forms-model').FormByIdInput} FormByIdInput
 * @typedef {import('@defra/forms-model').FormBySlugInput} FormBySlugInput
 * @typedef {import('@defra/forms-model').FormDefinition} FormDefinition
 * @typedef {import('@defra/forms-model').FormMetadataInput} FormMetadataInput
 * @typedef {import('@defra/forms-model').FormMetadataAuthor} FormMetadataAuthor
 * @typedef {import('mongodb').Db} Db
 */
