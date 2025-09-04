import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts
} from '~/src/repositories/save-and-exit-repository.js'

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
    form: record.data.form,
    question: record.data.security.question,
    invalidPasswordAttempts: record.invalidPasswordAttempts
  }
}

/**
 * Validate the full details of the save-and-exit credentials and return the form state
 * @param {ValidateSaveAndExitPayload} payload
 */
export async function validateAndGetSavedState(payload) {
  const { magicLinkId, securityAnswer } = payload

  let record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    // Invalid magic link
    throw Boom.notFound('Invalid magic link')
  }

  let validPassword = false
  try {
    validPassword = await argon2.verify(
      record.data.security.answer,
      securityAnswer
    )
  } catch {
    logger.error(
      `Invalid password hash for save-and-exit id ${magicLinkId} - unable to decrypt`
    )
  }

  if (!validPassword) {
    record = await incrementInvalidPasswordAttempts(magicLinkId)
  }

  return {
    form: record?.data.form,
    state: !validPassword ? {} : record?.data.state,
    invalidPasswordAttempts: record?.invalidPasswordAttempts,
    result: !validPassword ? 'Invalid security answer' : 'Success'
  }
}

/**
 * @import { ValidateSaveAndExitPayload } from '~/src/api/types.js'
 */
