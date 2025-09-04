import { formMetadataSchema } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import { getJson } from '~/src/services/httpService.js'

/**
 * Retrieves a form metadata from the form manager for a given form id
 * @param {string} formId - the slug of the form
 */
export async function getFormMetadataById(formId) {
  const { body: metadata } = /** @type {{ body: FormMetadata }} */ (
    await getJson(new URL(`${config.get('managerUrl')}/forms/${formId}`))
  )

  // Run it through the schema to coerce dates
  const result = formMetadataSchema.validate(metadata)

  if (result.error) {
    throw result.error
  }

  return result.value
}

/**
 * @import { FormMetadata } from '@defra/forms-model'
 */
