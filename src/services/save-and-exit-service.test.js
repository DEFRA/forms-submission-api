import { SecurityQuestionsEnum } from '@defra/forms-model'

import { buildDbDocument } from '~/src/repositories/__stubs__/save-and-exit.js'
import {
  deleteSaveAndExitRecord,
  getSaveAndExitRecord,
  incrementInvalidPasswordAttempts
} from '~/src/repositories/save-and-exit-repository.js'
import {
  getSavedLinkDetails,
  validateSavedLinkCredentials
} from '~/src/services/save-and-exit-service.js'

jest.mock('~/src/repositories/save-and-exit-repository.js')

describe('save-and-exit service', () => {
  describe('validateSavedLinkCredentials', () => {
    const submissionDocument = buildDbDocument()

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
      expect(deleteSaveAndExitRecord).not.toHaveBeenCalled()
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
      expect(deleteSaveAndExitRecord).not.toHaveBeenCalled()
    })

    test('should return state (and delete record) if all valid', async () => {
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
      expect(deleteSaveAndExitRecord).toHaveBeenCalled()
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
})

/**
 * @import { WithId } from 'mongodb'
 * @import { RunnerRecordFull } from '~/src/repositories/save-and-exit-repository.js'
 */
