import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { createLogger } from '~/src/helpers/logging/logger.js'
import { getSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'

const logger = createLogger()

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
    formId: record.data.form.id,
    question: record.data.security.question
  }
}

/**
 * Validate the full details of the save-and-exit credentials and return the form state
 * @param {SaveAndExitPayload} payload
 */
export async function validateAndGetSavedState(payload) {
  const { magicLinkId, data } = payload
  const { form, security } = data ?? {}

  const record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    throw Boom.badRequest(INVALID_MAGIC_LINK)
  }

  if (record.data.form.id !== form?.id) {
    throw Boom.badRequest('Invalid form id')
  }

  let validPassword = false
  try {
    validPassword = await argon2.verify(
      record.data.security.answer,
      security?.answer ?? ''
    )
  } catch {
    logger.error(
      `Invalid password hash for save-and-exit id ${magicLinkId} - unable to decrypt`
    )
  }

  if (!validPassword) {
    throw Boom.badRequest('Invalid security answer')
  }

  return {
    form: record.data.form,
    state: record.data.state
  }
}

/**
 * @import { SaveAndExitPayload } from '~/src/api/types.js'
 */
