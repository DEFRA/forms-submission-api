import { createI18nInstance } from '~/src/i18n/index.js'

/**
 * Creates a translator for the specified language, decorated with utility functions
 * for translating specific parts of the form definition.
 * @param {i18n} i18nInstance - instance of i18next which gets created on startup (reads the boilerplate files en-GB.json and cy.json)
 * @param {string} [language] - requested language
 * @returns {Translator}
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
    tForm: () => 'not-implemented',
    tPage: () => 'not-implemented',
    tComponent: () => 'not-implemented',
    tListItem: () => 'not-implemented',
    tSection: () => 'not-implemented',
    language
  }
}

export const translator = createTranslator(createI18nInstance())

/**
 * @import { i18n } from 'i18next'
 * @import { Translator } from '@defra/forms-engine-plugin/engine/i18n/types.js'
 */
