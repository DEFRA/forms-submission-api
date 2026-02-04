import { formatPaymentAmount, formatPaymentDate } from './payment-helper.js'

describe('payment-helper', () => {
  describe('formatPaymentDate', () => {
    it('should format an ISO date string to UK format with time', () => {
      // Using a fixed date to avoid timezone issues
      const result = formatPaymentDate('2025-11-10T17:01:29.000Z')

      // The date part should always be correct
      expect(result).toContain('10 November 2025')
      // The time will vary by timezone, so just check format
      expect(result).toMatch(/10 November 2025 \d{1,2}:\d{2}(am|pm)/)
    })

    it('should handle different dates correctly', () => {
      const result = formatPaymentDate('2026-01-26T09:30:15.000Z')

      expect(result).toContain('26 January 2026')
      expect(result).toMatch(/26 January 2026 \d{1,2}:\d{2}(am|pm)/)
    })
  })

  describe('formatPaymentAmount', () => {
    it('should format a whole number with two decimal places', () => {
      expect(formatPaymentAmount(10)).toBe('£10.00')
    })

    it('should format a decimal number with two decimal places', () => {
      expect(formatPaymentAmount(10.5)).toBe('£10.50')
    })

    it('should format a number with more than two decimal places', () => {
      expect(formatPaymentAmount(10.999)).toBe('£11.00')
    })

    it('should format zero correctly', () => {
      expect(formatPaymentAmount(0)).toBe('£0.00')
    })

    it('should format large amounts correctly', () => {
      expect(formatPaymentAmount(1234.56)).toBe('£1234.56')
    })
  })
})
