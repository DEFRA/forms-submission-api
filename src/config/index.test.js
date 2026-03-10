const ENV_EXPIRY_WINDOW =
  'EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_EXPIRY_WINDOW_HOURS'
const ENV_MINIMUM_HOURS =
  'EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_MINIMUM_HOURS_REMAINING'

describe('config validation', () => {
  afterEach(() => {
    process.env[ENV_EXPIRY_WINDOW] = undefined
    process.env[ENV_MINIMUM_HOURS] = undefined
  })

  describe('expiryWindowInHours', () => {
    it('should reject a negative value', async () => {
      process.env[ENV_EXPIRY_WINDOW] = '-1'

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'must be a positive number'
      )
    })

    it('should reject zero', async () => {
      process.env[ENV_EXPIRY_WINDOW] = '0'

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'must be a positive number'
      )
    })
  })

  describe('minimumHoursRemaining', () => {
    it('should reject a negative value', async () => {
      process.env[ENV_MINIMUM_HOURS] = '-1'

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'must be a positive number'
      )
    })

    it('should reject zero', async () => {
      process.env[ENV_MINIMUM_HOURS] = '0'

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'must be a positive number'
      )
    })
  })

  describe('expiryWindowInHours vs minimumHoursRemaining', () => {
    it('should reject when expiryWindowInHours equals minimumHoursRemaining', async () => {
      process.env[ENV_EXPIRY_WINDOW] = '10'
      process.env[ENV_MINIMUM_HOURS] = '10'

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'expiryWindowInHours (10) must be greater than minimumHoursRemaining (10)'
      )
    })

    it('should reject when expiryWindowInHours is less than minimumHoursRemaining', async () => {
      process.env[ENV_EXPIRY_WINDOW] = '2'
      process.env[ENV_MINIMUM_HOURS] = '36'

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'expiryWindowInHours (2) must be greater than minimumHoursRemaining (36)'
      )
    })

    it('should accept when expiryWindowInHours is greater than minimumHoursRemaining', async () => {
      await expect(import('~/src/config/index.js')).resolves.toBeDefined()
    })
  })
})
