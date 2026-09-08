import { createTranslator } from '~/src/i18n/createTranslator.js'
import { createI18nInstance } from '~/src/i18n/index.js'

describe('createTranslator', () => {
  it('should create a translator', () => {
    const translator = createTranslator(createI18nInstance())

    expect(translator.t('saveAndExit.progressSavedShort')).toBe(
      'Form progress saved'
    )
  })
})
