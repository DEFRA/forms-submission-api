import { createI18nInstance } from '~/src/i18n/index.js'

/**
 * Creates a translator for the specified language, decorated with utility functions
 * for translating specific parts of the form definition.
 * @param {i18n} i18nInstance - instance of i18next which gets created on startup (reads the boilerplate files en-GB.json and cy.json)
 * @param {string} [language] - requested language
 * @returns {SubmissionTranslator}
 */
export function createTranslator(i18nInstance, language = 'en-GB') {
  /**
   * @param {string} key
   * @param {Record<string, unknown>} [opts]
   */
  const t = (key, opts) =>
    i18nInstance.t(key, { lng: language, ns: 'plugin', ...opts })

  return {
    t,
    language
  }
}

/** @type {SubmissionTranslator} */
export const translator = createTranslator(createI18nInstance())

/**
 * @import { i18n } from 'i18next'
 * @import { SubmissionTranslator } from '~/src/api/types.js'
 */
