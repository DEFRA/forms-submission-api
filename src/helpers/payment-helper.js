/**
 * Formats a payment date for display
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date string (e.g., "26 January 2026 – 17:01:29")
 */
export function formatPaymentDate(isoString) {
  const date = new Date(isoString)
  const dateStr = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeStr = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  return `${dateStr} – ${timeStr}`
}

/**
 * Formats a payment amount with two decimal places
 * @param {number} amount - amount in pounds
 * @returns {string} Formatted amount (e.g., "£10.00")
 */
export function formatPaymentAmount(amount) {
  return `£${amount.toFixed(2)}`
}
