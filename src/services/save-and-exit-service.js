import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { getSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'

const INVALID_MAGIC_LINK = 'Invalid magic link'

/**
 * Validate the save-and-exit link (just verify link id at this stage)
 * @param {string} magicLinkId
 */
export async function validateSavedLink(magicLinkId) {
  if (!magicLinkId) {
    throw Boom.badRequest(INVALID_MAGIC_LINK)
  }

  const record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    throw Boom.badRequest(INVALID_MAGIC_LINK)
  }

  return {
    formId: record.data.formId,
    question: record.data.security.question
  }
}

/**
 * Validate the full details of the save-and-exit credentials and return the form state
 * @param {SaveAndExitPayload} payload
 */
export async function validateAndGetSavedState(payload) {
  const { magicLinkId, data } = payload
  const { formId, security } = data ?? {}

  const record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    throw Boom.badRequest(INVALID_MAGIC_LINK)
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
