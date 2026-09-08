import { SecurityQuestionsEnum } from '@defra/forms-model'

import { buildDbDocumentV1 } from '~/src/repositories/__stubs__/save-and-exit.js'
import {
  deleteSaveAndExitGroup,
  findSaveAndExitRecordsForUser,
  getLatestSaveAndExitByGroup,
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts,
  markSaveAndExitRecordAsConsumed,
  resetSaveAndExitRecord
} from '~/src/repositories/save-and-exit-repository.js'
import {
  cleanUpSaveAndExit,
  getSaveAndExitRecordsForUser,
  getSavedLinkDetails,
  resetSaveAndExitLink,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'

jest.mock('~/src/repositories/save-and-exit-repository.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}))

describe('save-and-exit service', () => {
  describe('validateSavedLinkCredentials', () => {
    const submissionDocument = buildDbDocumentV1()

    test('should throw if invalid magic link', async () => {
      // @ts-expect-error - undefined as returned record i.e. record not found
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(undefined)
      // @ts-expect-error - type doesnt conform as it is bad data
      await expect(validateSavedLinkCredentials({})).rejects.toThrow(
        'Invalid magic link'
      )
    })

    test('should return error result if incorrect security answer (invalid encryption)', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument)
      jest.mocked(incrementInvalidPasswordAttempts).mockResolvedValueOnce({
        ...submissionDocument,
        invalidPasswordAttempts: 1
      })
      const res = await validateSavedLinkCredentials(
        'invalid',
        'some-magic-link'
      )
      expect(res.validPassword).toBe(false)
      expect(markSaveAndExitRecordAsConsumed).not.toHaveBeenCalled()
    })

    test('should return error result if incorrect security answer (valid encryption but wrong answer)', async () => {
      jest.mocked(incrementInvalidPasswordAttempts).mockResolvedValueOnce({
        ...submissionDocument,
        invalidPasswordAttempts: 1
      })
      const submissionDocument2 = structuredClone(submissionDocument)
      submissionDocument2.security.answer =
        '$argon2id$v=19$m=65536,t=3,p=4$cW4DLWbXvQagUDNVUHgRtQ$aaT6McioURZqWOMnnOX8Kqun8ZmL0z+ucROI7nFnsdc'
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument)
      const res = await validateSavedLinkCredentials('a2', 'some-magic-link')
      expect(res.validPassword).toBe(false)
      expect(markSaveAndExitRecordAsConsumed).not.toHaveBeenCalled()
    })

    test('should return state if all valid', async () => {
      const submissionDocument2 = structuredClone(submissionDocument)
      submissionDocument2.security.answer =
        '$argon2id$v=19$m=65536,t=3,p=4$Rqca11F5xejLRd804Gc8Uw$6opyTQEN4I0WFCw5BM/7SCaOaECMm62LQaKvVH/DXQ0'
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument2)
      const res = await validateSavedLinkCredentials('some-magic-link', 'a3')
      expect(res).toBeDefined()
      // @ts-expect-error - dynamic field names
      expect(res.state.formField1).toBe('val1')
      // @ts-expect-error - dynamic field names
      expect(res.state.formField2).toBe('val2')
      expect(res.form.id).toBe('form-id')
    })
  })

  describe('getSavedLinkDetails', () => {
    test('should throw if missing link)', async () => {
      // @ts-expect-error - missing link value
      await expect(getSavedLinkDetails(undefined)).rejects.toThrow(
        'Invalid magic link'
      )
    })

    test('should throw if link not found)', async () => {
      // @ts-expect-error - missing record value
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(undefined)
      await expect(getSavedLinkDetails('12345')).rejects.toThrow(
        'Invalid magic link'
      )
    })

    test('should throw if link consumed)', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue({
        // @ts-expect-error - partial record value
        form: {
          id: '1234'
        },
        security: {
          question: SecurityQuestionsEnum.MemorablePlace,
          answer: ''
        },
        consumed: true,
        magicLinkGroupId: 'group-id'
      })
      jest.mocked(getLatestSaveAndExitByGroup).mockResolvedValue({
        // @ts-expect-error - partial record value
        form: {
          id: '1234'
        },
        security: {
          question: SecurityQuestionsEnum.MemorablePlace,
          answer: ''
        },
        consumed: false,
        magicLinkGroupId: 'group-id'
      })
      await expect(getSavedLinkDetails('12345')).rejects.toThrow(
        'Magic link has already been consumed'
      )
    })

    test('should return valid result)', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue({
        // @ts-expect-error - partial record value
        form: {
          id: '1234'
        },
        security: {
          question: SecurityQuestionsEnum.MemorablePlace,
          answer: ''
        }
      })
      const res = await getSavedLinkDetails('123456')
      expect(res).toEqual({ form: { id: '1234' }, question: 'memorable-place' })
    })
  })

  describe('resetSaveAndExitLink', () => {
    test('should return valid result', async () => {
      jest.mocked(resetSaveAndExitRecord).mockResolvedValue({
        recordFound: true,
        recordUpdated: true
      })
      const res = await resetSaveAndExitLink('123456')
      expect(res).toEqual({
        recordFound: true,
        recordUpdated: true
      })
    })
  })

  describe('cleanUpSaveAndExit', () => {
    test('should call repo method', async () => {
      jest.mocked(deleteSaveAndExitGroup).mockResolvedValue()
      // @ts-expect-error - partial mock of message
      await cleanUpSaveAndExit({ custom: { magicLinkGroupId: 'group-id' } }, {})
      expect(deleteSaveAndExitGroup).toHaveBeenCalledWith('group-id', {})
    })

    test('should ignore if no group id passed', async () => {
      jest.mocked(deleteSaveAndExitGroup).mockResolvedValue()
      // @ts-expect-error - partial mock of message
      await cleanUpSaveAndExit({}, {})
      expect(deleteSaveAndExitGroup).not.toHaveBeenCalled()
    })
  })

  describe('getSaveAndExitRecordsForUser', () => {
    const sub = 'a3f1c0de-0000-4000-8000-000000000001'
    const iss = 'https://identity.forms.example'
    const createdAt = new Date('2026-09-01T09:00:00.000Z')
    const expireAt = new Date('2026-09-29T09:00:00.000Z')

    test('should describe each record without exposing the answers', async () => {
      jest.mocked(findSaveAndExitRecordsForUser).mockResolvedValueOnce([
        /** @type {any} */ ({
          magicLinkId: 'magic-id',
          form: { id: 'form-id', title: 'My FirstForm' },
          state: { $$__referenceNumber: '123-456-789' },
          createdAt,
          expireAt
        })
      ])

      const records = await getSaveAndExitRecordsForUser(sub, iss)

      expect(findSaveAndExitRecordsForUser).toHaveBeenCalledWith(
        sub,
        iss,
        undefined
      )
      expect(records).toEqual([
        {
          magicLinkId: 'magic-id',
          referenceNumber: '123-456-789',
          formId: 'form-id',
          formTitle: 'My FirstForm',
          createdAt,
          expireAt
        }
      ])
    })

    test('should prefer a stored reference number over the one in the state', async () => {
      jest.mocked(findSaveAndExitRecordsForUser).mockResolvedValueOnce([
        /** @type {any} */ ({
          magicLinkId: 'magic-id',
          form: { id: 'form-id', title: 'My FirstForm' },
          referenceNumber: 'stored-ref',
          state: { $$__referenceNumber: 'state-ref' },
          createdAt,
          expireAt
        })
      ])

      const [record] = await getSaveAndExitRecordsForUser(sub, iss)

      expect(record.referenceNumber).toBe('stored-ref')
    })

    test('should describe a record that has neither a reference number nor a title', async () => {
      // A projection matching no reference number drops `state` entirely.
      jest.mocked(findSaveAndExitRecordsForUser).mockResolvedValueOnce([
        /** @type {any} */ ({
          magicLinkId: 'magic-id',
          form: { id: 'form-id' },
          createdAt,
          expireAt
        })
      ])

      const [record] = await getSaveAndExitRecordsForUser(sub, iss)

      expect(record.referenceNumber).toBeUndefined()
      expect(record.formTitle).toBeUndefined()
    })

    test('should pass a form id through to the query', async () => {
      jest.mocked(findSaveAndExitRecordsForUser).mockResolvedValueOnce([])

      await getSaveAndExitRecordsForUser(sub, iss, 'form-id')

      expect(findSaveAndExitRecordsForUser).toHaveBeenCalledWith(
        sub,
        iss,
        'form-id'
      )
    })
  })
})
