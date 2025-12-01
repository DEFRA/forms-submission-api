import { FormStatus } from '@defra/forms-engine-plugin/types'
import { formMetadataSchema } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { getJson } from '~/src/services/httpService.js'

const managerUrl = config.get('managerUrl')

/**
 * Retrieves a form metadata from the form manager for a given slug
 * @param {string} slug - the slug of the form
 */
export async function getFormMetadata(slug) {
  const getJsonByType = /** @type {typeof getJson<FormMetadata>} */ (getJson)

  const { body: metadata } = await getJsonByType(
    new URL(`${managerUrl}/forms/slug/${slug}`)
  )

  // Run it through the schema to coerce dates
  const result = formMetadataSchema.validate(metadata)

  if (result.error) {
    throw result.error
  }

  return result.value
}

/**
 * Retrieves a form metadata from the form manager for a given form id
 * @param {string} formId - the slug of the form
 */
export async function getFormMetadataById(formId) {
  const getJsonByType = /** @type {typeof getJson<FormMetadata>} */ (getJson)

  const { body: metadata } = await getJsonByType(
    new URL(`${managerUrl}/forms/${formId}`)
  )

  // Run it through the schema to coerce dates
  const result = formMetadataSchema.validate(metadata)

  if (result.error) {
    throw result.error
  }

  return result.value
}

/**
 * Retrieves a form definition from the form manager for a given id
 * @param {string} id - the id of the form
 * @param {FormStatus} state - the state of the form
 */
export async function getFormDefinition(id, state) {
  const getJsonByType = /** @type {typeof getJson<FormDefinition>} */ (getJson)

  const suffix = state === FormStatus.Draft ? `/${state}` : ''
  const { body: definition } = await getJsonByType(
    new URL(`${managerUrl}/forms/${id}/definition${suffix}`)
  )

  return definition
}

/**
 * Retrieves a form definition from the form manager for a given id
 * @param {string} id - the id of the form
 * @param {FormStatus} versionNumber - the version of the form
 */
export async function getFormDefinitionVersion(id, versionNumber) {
  const getJsonByType = /** @type {typeof getJson<FormDefinition>} */ (getJson)

  const { body: definition } = await getJsonByType(
    new URL(`${managerUrl}/forms/${id}/versions/${versionNumber}/definition`)
  )

  return definition
}

/**
 * @import { FormDefinition, FormMetadata } from '@defra/forms-model'
 */
