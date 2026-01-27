import { format } from 'date-fns'

/**
 * Formats a payment date for display
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date string (e.g., "26 January 2026 – 17:01:29")
 */
export function formatPaymentDate(isoString) {
  return format(new Date(isoString), 'd MMMM yyyy – HH:mm:ss')
}

/**
 * Formats a payment amount with two decimal places
 * @param {number} amount - amount in pounds
 * @returns {string} Formatted amount (e.g., "£10.00")
 */
export function formatPaymentAmount(amount) {
  return `£${amount.toFixed(2)}`
}
