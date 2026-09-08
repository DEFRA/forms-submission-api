import { getErrorMessage } from '@defra/forms-model'
import i18next, { createInstance } from 'i18next'

import { logger } from '~/src/helpers/logging/logger.js'
import cy from '~/src/i18n/translations/cy.json' with { type: 'json' }
import enGB from '~/src/i18n/translations/en-GB.json' with { type: 'json' }

i18next
  .init({
    resources: {
      'en-GB': { translation: enGB },
      cy: { translation: cy }
    },
    fallbackLng: 'en-GB',
    interpolation: {
      prefix: '[[',
      suffix: ']]',
      escapeValue: false
    }
  })
  .catch(
    /** @param {unknown} err */
    (err) => {
      logger.error(`Fatal init for translator i18next: ${getErrorMessage(err)}`)
    }
  )

/**
 * Generic translation utility function
 * @param {string} key - key for lookup
 * @param {string} language - language requested
 * @param { Record<string, unknown> } [options]
 * @returns {string}
 */
export function t(key, language, options) {
  return i18next.t(key, { lng: language, ...options })
}

/**
 * Creates an instance of i18next with base (boilerplate) translation files loaded (en-GB.json and cy.json),
 * and appropriate namespaces for loading of form-specific translations later
 */
export function createI18nInstance() {
  const instance = createInstance()

  // Since we are re-using the translation utilities in @defra/forms-engine-plugin,
  // the namespace of 'plugin' must be used for our base translations so that the method
  // calls from plugin work with our translations.
  instance
    .init({
      resources: {
        'en-GB': {
          plugin: enGB
        },
        cy: {
          plugin: cy
        }
      },
      fallbackLng: 'en-GB',
      ns: ['plugin', 'form'],
      defaultNS: 'plugin',
      interpolation: {
        prefix: '[[',
        suffix: ']]',
        escapeValue: false
      }
    })
    .catch(
      /** @param {unknown} err */
      (err) => {
        // init with inline resources completes synchronously — unreachable
        logger.error(
          `Fatal init for translator instance: ${getErrorMessage(err)}`
        )
      }
    )

  return instance
}
