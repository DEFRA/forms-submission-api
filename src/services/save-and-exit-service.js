import Boom from '@hapi/boom'
import argon2 from 'argon2'

import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts,
  markSaveAndExitRecordAsConsumed
} from '~/src/repositories/save-and-exit-repository.js'

const logger = createLogger()

const INVALID_MAGIC_LINK = 'Invalid magic link'

/**
 * Get the save and exit link by magic link id
 * @param {string} magicLinkId - magic link id
 */
export async function getSavedLinkDetails(magicLinkId) {
  const record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    throw Boom.notFound(INVALID_MAGIC_LINK)
  }

  return {
    form: record.form,
    question: record.security.question,
    invalidPasswordAttempts: record.invalidPasswordAttempts
  }
}

/**
 * Validate the full details of the save and exit credentials
 * @param {string} magicLinkId - magic link id
 * @param {string} securityAnswer - security answer provided by user
 */
export async function validateSavedLinkCredentials(
  magicLinkId,
  securityAnswer
) {
  let record = await getSaveAndExitRecord(magicLinkId)

  if (!record) {
    // Invalid magic link
    throw Boom.notFound('Invalid magic link')
  }

  let validPassword = false
  try {
    validPassword = await argon2.verify(
      record.security.answer,
      securityAnswer.toLowerCase()
    )
  } catch (err) {
    logger.error(
      err,
      `Invalid password hash for save and exit id ${magicLinkId} - unable to decrypt`
    )
  }

  if (validPassword) {
    // Once a valid password has been provided, mark the save and exit record as consumed
    await markSaveAndExitRecordAsConsumed(magicLinkId)
  } else {
    // Otherwise, increment the password attempts and return updated record
    record = await incrementInvalidPasswordAttempts(magicLinkId)
  }

  return {
    form: record.form,
    state: !validPassword ? {} : record.state,
    invalidPasswordAttempts: record.invalidPasswordAttempts,
    question: record.security.question,
    validPassword
  }
}
