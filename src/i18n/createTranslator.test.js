import { createTranslator } from '~/src/i18n/createTranslator.js'
import { createI18nInstance } from '~/src/i18n/index.js'

const NOT_IMPLEMENTED = 'not-implemented'

describe('createTranslator', () => {
  it('should create a translator and ensure object methods are not implemented', () => {
    const translator = createTranslator(createI18nInstance())

    expect(translator.tForm('x')).toBe(NOT_IMPLEMENTED)

    const page = /** @type {Page} */ ({})
    expect(translator.tPage(page, 'title')).toBe(NOT_IMPLEMENTED)

    const component = /** @type {ComponentDef} */ ({})
    expect(translator.tComponent(component, 'title')).toBe(NOT_IMPLEMENTED)

    const item = /** @type {Item} */ ({})
    expect(translator.tListItem(item, 'text')).toBe(NOT_IMPLEMENTED)

    const section = /** @type {Section} */ ({})
    expect(translator.tSection(section, 'title')).toBe(NOT_IMPLEMENTED)
  })
})

/**
 * @import { ComponentDef, Item, Page, Section } from '@defra/forms-model'
 */
