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

  describe('submissionLinking.allowedForms', () => {
    const ENV_ALLOWED_FORMS = 'SUBMISSION_LINKING_ALLOWED_FORMS'

    afterEach(() => {
      delete process.env.SUBMISSION_LINKING_ALLOWED_FORMS
    })

    /**
     * @param {string} value
     */
    async function loadAllowedForms(value) {
      process.env[ENV_ALLOWED_FORMS] = value

      const { config } = await import('~/src/config/index.js')

      return config.get('submissionLinking.allowedForms')
    }

    it('should allow no forms by default', async () => {
      const { config } = await import('~/src/config/index.js')

      expect(config.get('submissionLinking.allowedForms')).toEqual([])
    })

    it('should allow no forms when the value is empty', async () => {
      expect(await loadAllowedForms('  ')).toEqual([])
    })

    it('should read the forms from a JSON array', async () => {
      const forms = [
        { formId: 'form-1', formName: 'Order a pizza' },
        { formId: 'form-2', formName: '' },
        { formId: 'form-3', formName: null },
        { formId: 'form-4' }
      ]

      expect(await loadAllowedForms(JSON.stringify(forms))).toEqual(forms)
    })

    it.each([
      ['not JSON', 'form-1,form-2'],
      ['not an array', '{"formId":"form-1"}']
    ])('should reject a value that is %s', async (_description, value) => {
      process.env[ENV_ALLOWED_FORMS] = value

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'must be a JSON array of allowed forms'
      )
    })

    it.each([
      ['a form without an id', '[{"formName":"Order a pizza"}]'],
      ['a form with an empty id', '[{"formId":""}]'],
      ['a property other than formId and formName', '[{"formID":"form-1"}]'],
      ['the same form twice', '[{"formId":"form-1"},{"formId":"form-1"}]']
    ])('should reject %s', async (_description, value) => {
      process.env[ENV_ALLOWED_FORMS] = value

      await expect(import('~/src/config/index.js')).rejects.toThrow(
        'must be a list of allowed forms'
      )
    })
  })
})
