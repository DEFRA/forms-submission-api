/**
 * Determines if a retrieval key should be treated as case sensitive.
 * If the retrieval key contains any uppercase letters, it's considered case sensitive.
 * Numbers and special characters are ignored.
 * @param {string} retrievalKey - The retrieval key to check.
 * @returns {boolean} Returns true if the retrieval key contains any uppercase letters (case sensitive), false otherwise.
 */
export function isRetrievalKeyCaseSensitive(retrievalKey) {
  const hasUpperCase = /[A-Z]/.test(retrievalKey)
  return hasUpperCase
}
