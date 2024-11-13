import { isRetrievalKeyCaseSensitive } from '~/src/helpers/retrieval-key/retrieval-key.js'

describe('isRetrievalKeyCaseSensitive', () => {
  test('should return true when retrieval key contains any uppercase letters', () => {
    const caseSensitiveKeys = [
      'Alice.Wonderland@example.org',
      'BobBuilder99@construction.net',
      'SarahConnor1984@skynet.com',
      'Dr.Strange@marvel.universe',
      'TheQuickBrownFox@jungle.wild',
      'JAVAScriptGuru123@code.dev',
      'UpPeRLoweR@mixed.case',
      'CapitalCASE@text.style',
      'CaseSensitiveKey@testing.io'
    ]

    caseSensitiveKeys.forEach((key) => {
      expect(isRetrievalKeyCaseSensitive(key)).toBe(true)
    })
  })

  test('should return false when retrieval key is all lowercase', () => {
    const caseInsensitiveKeys = [
      'alice.wonderland@example.org',
      'bobbuilder99@construction.net',
      'sarahconnor1984@skynet.com',
      'dr.strange@marvel.universe',
      'thequickbrownfox@jungle.wild',
      'javascriptguru123@code.dev',
      'lowercaseonly@text.style',
      'nocapitalletters@simple.dev',
      'casesensitivekey@testing.io'
    ]

    caseInsensitiveKeys.forEach((key) => {
      expect(isRetrievalKeyCaseSensitive(key)).toBe(false)
    })
  })

  test('should return false when retrieval key contains no letters', () => {
    const nonLetterKeys = [
      '1234567890',
      '!@#$%^&*()_+',
      '0987654321',
      '123-456-7890',
      ''
    ]

    nonLetterKeys.forEach((key) => {
      expect(isRetrievalKeyCaseSensitive(key)).toBe(false)
    })
  })
})
