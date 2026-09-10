import { t } from '~/src/i18n/index.js'

describe('i18n', () => {
  describe('t()', () => {
    it('returns the en-GB string for a known key', () => {
      expect(t('saveAndExit.progressSavedShort', 'en-GB')).toBe(
        'Form progress saved'
      )
    })

    it('falls back to en-GB for an unknown language', () => {
      expect(t('saveAndExit.progressSavedShort', 'unkno')).toBe(
        'Form progress saved'
      )
    })

    it('interpolates values into the string', () => {
      expect(
        t('saveAndExit.signInToContinue', 'en-GB', {
          formTitle: 'My test form'
        })
      ).toBe(
        "Sign in using the link below to continue your 'My test form' form."
      )
    })
  })
})
