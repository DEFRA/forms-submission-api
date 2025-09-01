import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { getSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'

/**
 * Accepts file status into the forms-submission-api
 * @param {SaveAndExitPayload} payload
 */
export async function validateAndGetSavedState(payload) {
  const { entityId, data } = payload
  const { formId, security } = data ?? {}

  const record = await getSaveAndExitRecord(entityId)

  if (!record) {
    throw Boom.badRequest('Invalid magic link')
  }

  if (record.data.formId !== formId) {
    throw Boom.badRequest('Invalid form id')
  }

  let validPassword = false
  try {
    validPassword = await argon2.verify(
      record.data.security.answer,
      security?.answer ?? ''
    )
  } catch {}

  if (!validPassword) {
    throw Boom.badRequest('Invalid security answer')
  }

  return record.data.state
}

/**
 * @import { SaveAndExitPayload } from '~/src/api/types.js'
 */
