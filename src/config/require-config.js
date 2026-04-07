/**
 * @template T
 * @param {T} value
 * @param {string} key
 * @returns {NonNullable<T>}
 */
export function requireConfig(value, key) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing required config: ${key}`)
  }

  return /** @type {NonNullable<T>} */ (value)
}
