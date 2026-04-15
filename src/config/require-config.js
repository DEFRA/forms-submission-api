/**
 * @template T
 * @param {T} value
 * @param {string} key
 * @returns {NonNullable<T>}
 */
export function requireConfig(value, key) {
  if (value == null || (typeof value === 'string' && value === '')) {
    throw new Error(`Missing required config: ${key}`)
  }

  return /** @type {NonNullable<T>} */ (value)
}
