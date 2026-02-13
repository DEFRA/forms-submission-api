/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { FormStatus, SecurityQuestionsEnum } from '@defra/forms-model'

import { config } from '~/src/config/index.js'
import {
  findExpiringRecords,
  lockRecordForExpiryEmail,
  markExpiryEmailSent
} from '~/src/repositories/save-and-exit-repository.js'
import {
  constructExpiryReminderEmailContent,
  processExpiringSaveAndExitRecords
} from '~/src/services/expiring-save-and-exit.js'
import { getFormMetadataById } from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'

jest.mock('~/src/repositories/save-and-exit-repository.js')
jest.mock('~/src/services/forms-service.js')
jest.mock('~/src/services/notify.js')

/**
 * @param {Partial<import('~/src/api/types.js').SaveAndExitDocument>} overrides
 * @returns {import('mongodb').WithId<import('~/src/api/types.js').SaveAndExitDocument>}
 */
function createMockDocument(overrides = {}) {
  const defaults = {
    magicLinkId: 'test-magic-link',
    email: 'test@example.com',
    expireAt: new Date(),
    form: {
      baseUrl: 'http://localhost:3009',
      id: 'test-form-id',
      status: FormStatus.Draft,
      isPreview: false
    },
    security: {
      question: SecurityQuestionsEnum.MemorablePlace,
      answer: 'test-answer'
    },
    state: {},
    invalidPasswordAttempts: 0,
    createdAt: new Date(),
    version: 1,
    notify: null
  }

  return /** @type {import('mongodb').WithId<import('~/src/api/types.js').SaveAndExitDocument>} */ ({
    ...defaults,
    ...overrides,
    form: { ...defaults.form, ...(overrides.form ?? {}) }
  })
}

describe('expiring-save-and-exit', () => {
  const mockRuntimeId = 'test-runtime-id-123'
  const minimumHoursRemaining = config.get(
    'emailUsersExpiringSoonSavedForLaterLink.minimumHoursRemaining'
  )

  const mockFindExpiringRecords =
    /** @type {jest.MockedFunction<typeof findExpiringRecords>} */ (
      findExpiringRecords
    )
  const mockLockRecordForExpiryEmail =
    /** @type {jest.MockedFunction<typeof lockRecordForExpiryEmail>} */ (
      lockRecordForExpiryEmail
    )
  const mockMarkExpiryEmailSent =
    /** @type {jest.MockedFunction<typeof markExpiryEmailSent>} */ (
      markExpiryEmailSent
    )
  const mockGetFormMetadataById =
    /** @type {jest.MockedFunction<typeof getFormMetadataById>} */ (
      getFormMetadataById
    )
  const mockSendNotification =
    /** @type {jest.MockedFunction<typeof sendNotification>} */ (
      sendNotification
    )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('constructExpiryReminderEmailContent', () => {
    test('should construct email content correctly', () => {
      // Set expireAt to 48 hours from now
      const now = new Date()
      const expireAt = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const mockDocument = createMockDocument({
        magicLinkId: 'test-magic-link',
        email: 'test@example.com',
        expireAt
      })

      const result = constructExpiryReminderEmailContent(
        mockDocument,
        'Test Form'
      )

      expect(result.emailAddress).toBe('test@example.com')
      expect(result.templateId).toBe(
        config.get('notifyExpiryReminderTemplateId')
      )
      expect(result.personalisation.subject).toBe(
        'Form progress expires in 48 hours'
      )
      expect(result.personalisation.body).toContain(
        'Your progress with Test Form expires in 48 hours'
      )
      expect(result.personalisation.body).toContain(
        `http://localhost:3009/resume-form/test-form-id/test-magic-link`
      )
      expect(result.personalisation.body).toContain('valid for 48 hours')
      expect(result.emailReplyToId).toBe(config.get('notifyReplyToId'))
    })

    test('should round down hours correctly', () => {
      const now = new Date()
      // Set expireAt to 36.9 hours from now
      const expireAt = new Date(now.getTime() + 36.9 * 60 * 60 * 1000)

      const mockDocument = createMockDocument({
        magicLinkId: 'test-magic-link-2',
        email: 'test2@example.com',
        expireAt,
        form: {
          id: 'test-form-id-2'
        }
      })

      const result = constructExpiryReminderEmailContent(
        mockDocument,
        'Another Form'
      )

      // Should round down to 36 hours, not 37
      expect(result.personalisation.body).toContain('in 36 hours')
    })

    test('should handle single hour correctly', () => {
      const now = new Date()
      // Set expireAt to 1.5 hours from now
      const expireAt = new Date(now.getTime() + 1.5 * 60 * 60 * 1000)

      const mockDocument = createMockDocument({
        magicLinkId: 'test-magic-link-3',
        email: 'test3@example.com',
        expireAt,
        form: {
          id: 'test-form-id-3'
        }
      })

      const result = constructExpiryReminderEmailContent(
        mockDocument,
        'Third Form'
      )

      // Should round down to 1 hour
      expect(result.personalisation.body).toContain('in 1 hour')
    })
  })

  describe('processExpiringSaveAndExitRecords', () => {
    test('should return zero counts when no records are found', async () => {
      mockFindExpiringRecords.mockResolvedValue([])

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 0, failed: 0 })
      expect(mockFindExpiringRecords).toHaveBeenCalledWith(
        36,
        minimumHoursRemaining
      )
      expect(mockLockRecordForExpiryEmail).not.toHaveBeenCalled()
      expect(mockSendNotification).not.toHaveBeenCalled()
      expect(mockMarkExpiryEmailSent).not.toHaveBeenCalled()
    })

    test('should process expiring records successfully with title in document', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        createMockDocument({
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            ...createMockDocument().form,
            id: 'form-1',
            title: 'Form One'
          },
          version: 1
        }),
        createMockDocument({
          magicLinkId: 'test-link-2',
          email: 'test2@example.com',
          expireAt,
          form: {
            ...createMockDocument().form,
            id: 'form-2',
            title: 'Form Two'
          },
          version: 1
        })
      ]

      const mockLockedRecord1 = {
        ...mockRecords[0],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      const mockLockedRecord2 = {
        ...mockRecords[1],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      mockFindExpiringRecords.mockResolvedValue(mockRecords)
      mockLockRecordForExpiryEmail
        .mockResolvedValueOnce(mockLockedRecord1)
        .mockResolvedValueOnce(mockLockedRecord2)
      mockSendNotification.mockResolvedValue({ success: true })
      mockMarkExpiryEmailSent.mockResolvedValue({})

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 2, failed: 0 })
      expect(mockFindExpiringRecords).toHaveBeenCalledWith(
        36,
        minimumHoursRemaining
      )
      expect(mockLockRecordForExpiryEmail).toHaveBeenCalledTimes(2)
      expect(mockLockRecordForExpiryEmail).toHaveBeenCalledWith(
        'test-link-1',
        mockRuntimeId,
        1
      )
      expect(mockLockRecordForExpiryEmail).toHaveBeenCalledWith(
        'test-link-2',
        mockRuntimeId,
        1
      )
      expect(mockSendNotification).toHaveBeenCalledTimes(2)
      expect(mockMarkExpiryEmailSent).toHaveBeenCalledTimes(2)
      expect(mockMarkExpiryEmailSent).toHaveBeenCalledWith(
        'test-link-1',
        mockRuntimeId
      )
      expect(mockMarkExpiryEmailSent).toHaveBeenCalledWith(
        'test-link-2',
        mockRuntimeId
      )
      expect(mockGetFormMetadataById).not.toHaveBeenCalled()
    })

    test('should fetch form title from API when not in document', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        {
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false
          },
          version: 1
        }
      ]

      const mockLockedRecord1 = {
        ...mockRecords[0],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      findExpiringRecords.mockResolvedValue(mockRecords)
      lockRecordForExpiryEmail.mockResolvedValueOnce(mockLockedRecord1)
      getFormMetadataById.mockResolvedValue({ title: 'Fetched Form Title' })
      sendNotification.mockResolvedValue({ success: true })
      markExpiryEmailSent.mockResolvedValue({})

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 1, failed: 0 })
      expect(getFormMetadataById).toHaveBeenCalledWith('form-1')
      expect(sendNotification).toHaveBeenCalledTimes(1)
      const emailCall = sendNotification.mock.calls[0][0]
      expect(emailCall.personalisation.body).toContain('your form')
      expect(markExpiryEmailSent).toHaveBeenCalledTimes(1)
    })

    test('should cache form titles and not call API multiple times for same form', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        {
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false
          },
          version: 1
        },
        {
          magicLinkId: 'test-link-2',
          email: 'test2@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false
          },
          version: 1
        }
      ]

      const mockLockedRecord1 = {
        ...mockRecords[0],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      const mockLockedRecord2 = {
        ...mockRecords[1],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      findExpiringRecords.mockResolvedValue(mockRecords)
      lockRecordForExpiryEmail
        .mockResolvedValueOnce(mockLockedRecord1)
        .mockResolvedValueOnce(mockLockedRecord2)
      getFormMetadataById.mockResolvedValue({ title: 'Cached Form Title' })
      sendNotification.mockResolvedValue({ success: true })
      markExpiryEmailSent.mockResolvedValue({})

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 2, failed: 0 })
      expect(getFormMetadataById).toHaveBeenCalledTimes(1)
      expect(getFormMetadataById).toHaveBeenCalledWith('form-1')
      expect(sendNotification).toHaveBeenCalledTimes(2)
    })

    test('should use fallback title when API fetch fails', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        {
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false
          },
          version: 1
        }
      ]

      const mockLockedRecord1 = {
        ...mockRecords[0],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      findExpiringRecords.mockResolvedValue(mockRecords)
      lockRecordForExpiryEmail.mockResolvedValueOnce(mockLockedRecord1)
      getFormMetadataById.mockRejectedValue(new Error('API Error'))
      sendNotification.mockResolvedValue({ success: true })
      markExpiryEmailSent.mockResolvedValue({})

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 1, failed: 0 })
      expect(getFormMetadataById).toHaveBeenCalledWith('form-1')
      expect(sendNotification).toHaveBeenCalledTimes(1)
      const emailCall = sendNotification.mock.calls[0][0]
      expect(emailCall.personalisation.body).toContain('your form')
    })

    test('should skip records that fail to lock', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        {
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false,
            title: 'Form One'
          },
          version: 1
        },
        {
          magicLinkId: 'test-link-2',
          email: 'test2@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-2',
            status: 'draft',
            isPreview: false,
            title: 'Form Two'
          },
          version: 1
        }
      ]

      const mockLockedRecord2 = {
        ...mockRecords[1],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      findExpiringRecords.mockResolvedValue(mockRecords)
      lockRecordForExpiryEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockLockedRecord2)
      sendNotification.mockResolvedValue({ success: true })
      markExpiryEmailSent.mockResolvedValue({})

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 1, failed: 0 })
      expect(lockRecordForExpiryEmail).toHaveBeenCalledTimes(2)
      expect(sendNotification).toHaveBeenCalledTimes(1)
      expect(markExpiryEmailSent).toHaveBeenCalledTimes(1)
      expect(markExpiryEmailSent).toHaveBeenCalledWith(
        'test-link-2',
        mockRuntimeId
      )
    })

    test('should skip records with lock ID mismatch', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        {
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false,
            title: 'Form One'
          },
          version: 1
        }
      ]

      const mockLockedRecordWithWrongId = {
        ...mockRecords[0],
        notify: {
          expireLockId: 'different-runtime-id',
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      findExpiringRecords.mockResolvedValue(mockRecords)
      lockRecordForExpiryEmail.mockResolvedValueOnce(
        mockLockedRecordWithWrongId
      )

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 0, failed: 0 })
      expect(lockRecordForExpiryEmail).toHaveBeenCalledTimes(1)
      expect(sendNotification).not.toHaveBeenCalled()
      expect(markExpiryEmailSent).not.toHaveBeenCalled()
    })

    test('should handle errors and continue processing other records', async () => {
      const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

      const mockRecords = [
        {
          magicLinkId: 'test-link-1',
          email: 'test1@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-1',
            status: 'draft',
            isPreview: false,
            title: 'Form One'
          },
          version: 1
        },
        {
          magicLinkId: 'test-link-2',
          email: 'test2@example.com',
          expireAt,
          form: {
            baseUrl: 'http://localhost:3009',
            id: 'form-2',
            status: 'draft',
            isPreview: false,
            title: 'Form Two'
          },
          version: 1
        }
      ]

      const mockLockedRecord1 = {
        ...mockRecords[0],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      const mockLockedRecord2 = {
        ...mockRecords[1],
        notify: {
          expireLockId: mockRuntimeId,
          expireLockTimestamp: new Date(),
          expireEmailSentTimestamp: null
        }
      }

      findExpiringRecords.mockResolvedValue(mockRecords)
      lockRecordForExpiryEmail
        .mockResolvedValueOnce(mockLockedRecord1)
        .mockResolvedValueOnce(mockLockedRecord2)
      sendNotification
        .mockRejectedValueOnce(new Error('Email send failed'))
        .mockResolvedValueOnce({ success: true })
      markExpiryEmailSent.mockResolvedValue({})

      const result = await processExpiringSaveAndExitRecords(mockRuntimeId, 36)

      expect(result).toEqual({ processed: 1, failed: 1 })
      expect(sendNotification).toHaveBeenCalledTimes(2)
      expect(markExpiryEmailSent).toHaveBeenCalledTimes(1)
      expect(markExpiryEmailSent).toHaveBeenCalledWith(
        'test-link-2',
        mockRuntimeId
      )
    })
  })
})
