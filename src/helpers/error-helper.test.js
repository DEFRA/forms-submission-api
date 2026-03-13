import Boom from '@hapi/boom'

import { getBoomErrorMessage } from '~/src/helpers/error-helper.js'

describe('error-helper', () => {
  test('handles non-boom error', () => {
    const err = new Error('error message 1')
    expect(getBoomErrorMessage(err)).toBe('error message 1')
  })

  test('handles boom error with one message', () => {
    const err = Boom.badRequest('general error message', {
      errors: [{ error: 'error type 2', message: 'error message 2' }]
    })
    expect(getBoomErrorMessage(err)).toBe(
      'general error message error type 2: error message 2'
    )
  })

  test('handles boom error with multiple messages', () => {
    const err = Boom.badRequest('general error message', {
      errors: [
        { error: 'error type 3', message: 'error message 3' },
        { error: 'error type 4', message: 'error message 4' }
      ]
    })
    expect(getBoomErrorMessage(err)).toBe(
      'general error message error type 3: error message 3, error type 4: error message 4'
    )
  })
})
