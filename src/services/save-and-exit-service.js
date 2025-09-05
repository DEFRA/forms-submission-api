import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  deleteSaveAndExitRecord,
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts
} from '~/src/repositories/save-and-exit-repository.js'

const logger = createLogger()

const INVALID_MAGIC_LINK = 'Invalid magic link'

/**
 * Validate the save-and-exit link (just verify link id at this stage)
 * @param {string} magicLinkId
 */
export async function getSavedLinkDetails(magicLinkId) {
  if (!magicLinkId) {
    throw Boom.badRequest(INVALID_MAGIC_LINK)
  }

  const record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    throw Boom.badRequest(INVALID_MAGIC_LINK)
  }

  return {
    form: record.form,
    question: record.security.question,
    invalidPasswordAttempts: record.invalidPasswordAttempts
  }
}

/**
 * Validate the full details of the save-and-exit credentials
 * @param {ValidateSaveAndExitPayload} payload
 */
export async function validateSavedLinkCredentials(payload) {
  const { magicLinkId, securityAnswer } = payload

  let record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    // Invalid magic link
    throw Boom.notFound('Invalid magic link')
  }

  let validPassword = false
  try {
    validPassword = await argon2.verify(record.security.answer, securityAnswer)
  } catch {
    logger.error(
      `Invalid password hash for save-and-exit id ${magicLinkId} - unable to decrypt`
    )
  }

  if (!validPassword) {
    record = await incrementInvalidPasswordAttempts(magicLinkId)
  } else {
    await deleteSaveAndExitRecord(magicLinkId)
  }

  return {
    form: record?.form,
    state: !validPassword ? {} : record?.state,
    invalidPasswordAttempts: record?.invalidPasswordAttempts,
    securityQuestion: record?.security.question,
    result: !validPassword ? 'Invalid security answer' : 'Success'
  }
}

/**
 * @import { ValidateSaveAndExitPayload } from '~/src/api/types.js'
 */
