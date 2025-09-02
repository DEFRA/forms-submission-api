import { getErrorMessage } from '~/src/helpers/error-message.js'

describe('getErrorMessage', () => {
  test('returns message from Error objects', () => {
    const error = new Error('Test error message')
    expect(getErrorMessage(error)).toBe('Test error message')
  })

  test('returns message from custom Error subclasses', () => {
    const typeError = new TypeError('Type error message')
    const rangeError = new RangeError('Range error message')

    expect(getErrorMessage(typeError)).toBe('Type error message')
    expect(getErrorMessage(rangeError)).toBe('Range error message')
  })

  test('converts string values to string', () => {
    expect(getErrorMessage('string error')).toBe('string error')
    expect(getErrorMessage('')).toBe('')
  })

  test('converts number values to string', () => {
    expect(getErrorMessage(404)).toBe('404')
    expect(getErrorMessage(0)).toBe('0')
    expect(getErrorMessage(-1)).toBe('-1')
  })

  test('converts boolean values to string', () => {
    expect(getErrorMessage(true)).toBe('true')
    expect(getErrorMessage(false)).toBe('false')
  })

  test('converts null and undefined to string', () => {
    expect(getErrorMessage(null)).toBe('null')
    expect(getErrorMessage(undefined)).toBe('undefined')
  })

  test('converts object values to string', () => {
    const obj = { message: 'object error' }
    expect(getErrorMessage(obj)).toBe('[object Object]')
  })

  test('converts array values to string', () => {
    const arr = ['error', 'array']
    expect(getErrorMessage(arr)).toBe('error,array')
  })

  test('handles Error objects with empty messages', () => {
    const error = new Error('')
    expect(getErrorMessage(error)).toBe('')
  })

  test('handles Error objects with special characters in message', () => {
    const error = new Error(
      'Error with "quotes" and \'apostrophes\' and symbols: !@#$%'
    )
    expect(getErrorMessage(error)).toBe(
      'Error with "quotes" and \'apostrophes\' and symbols: !@#$%'
    )
  })
})
