import { FormStatus, SecurityQuestionsEnum } from '@defra/forms-model'

import {
  buildSaveAndExitMessage,
  buildSubmissionMetaBase,
  buildSubmissionRecordDocument,
  buildSubmissionRecordDocumentMeta
} from '~/src/repositories/__stubs__/save-and-exit.js'
import { getSaveAndExitRecord } from '~/src/repositories/save-and-exit-repository.js'
import {
  validateAndGetSavedState,
  validateSavedLink
} from '~/src/services/save-and-exit-service.js'

jest.mock('~/src/repositories/save-and-exit-repository.js')

describe('save-and-exit service', () => {
  describe('validateAndGetSavedState', () => {
    const recordInput = buildSubmissionMetaBase({
      recordCreatedAt: new Date('2025-08-08'),
      messageId: '23b3e93c-5bea-4bcc-ab27-be69ce82a190'
    })
    const message = buildSaveAndExitMessage()
    const submissionRecordInput = buildSubmissionRecordDocument(
      message,
      recordInput
    )
    const submissionDocument = /** @type {WithId<RunnerRecordFull>} */ (
      buildSubmissionRecordDocument(
        message,
        buildSubmissionRecordDocumentMeta({
          ...submissionRecordInput
        })
      )
    )

    test('should throw if invalid magic link', async () => {
      // @ts-expect-error - undefined as returned record i.e. record not found
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(undefined)
      // @ts-expect-error - type doesnt conform as it is bad data
      await expect(validateAndGetSavedState({})).rejects.toThrow(
        'Invalid magic link'
      )
    })

    test('should throw if missing formId', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument)
      // @ts-expect-error - type doesnt conform as it is bad data
      await expect(validateAndGetSavedState({})).rejects.toThrow(
        'Invalid form id'
      )
    })

    test('should throw if incorrect formId', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument)
      await expect(
        // @ts-expect-error - type doesnt conform as it is bad data
        validateAndGetSavedState({ data: { formId: 'invalid ' } })
      ).rejects.toThrow('Invalid form id')
    })

    test('should throw if incorrect security answer (invalid encryption)', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument)
      await expect(
        validateAndGetSavedState({
          data: {
            // @ts-expect-error - type doesnt conform as it is bad data
            form: {
              id: '688131eeff67f889d52c66cc'
            },
            security: { question: 'q2', answer: 'invalid' }
          }
        })
      ).rejects.toThrow('Invalid security answer')
    })

    test('should throw if incorrect security answer (valid encryption but wrong answer)', async () => {
      const submissionDocument2 = structuredClone(submissionDocument)
      submissionDocument2.data.security.answer =
        '$argon2id$v=19$m=65536,t=3,p=4$cW4DLWbXvQagUDNVUHgRtQ$aaT6McioURZqWOMnnOX8Kqun8ZmL0z+ucROI7nFnsdc'
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument)
      await expect(
        validateAndGetSavedState({
          data: {
            // @ts-expect-error - type doesnt conform as it is bad data
            form: {
              id: '688131eeff67f889d52c66cc'
            },
            email: 'my-email@test.com',
            security: {
              question: 'q3',
              answer: 'a1'
            }
          },
          magicLinkId: '12345'
        })
      ).rejects.toThrow('Invalid security answer')
    })

    test('should return state if all valid', async () => {
      const submissionDocument2 = structuredClone(submissionDocument)
      submissionDocument2.data.security.answer =
        '$argon2id$v=19$m=65536,t=3,p=4$Rqca11F5xejLRd804Gc8Uw$6opyTQEN4I0WFCw5BM/7SCaOaECMm62LQaKvVH/DXQ0'
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(submissionDocument2)
      const res = await validateAndGetSavedState({
        data: {
          form: {
            id: '688131eeff67f889d52c66cc',
            title: 'My First Form',
            slug: 'my-first-form',
            status: FormStatus.Draft,
            isPreview: false
          },
          email: 'my-email@test.com',
          security: {
            question: 'q1',
            answer: 'a3'
          }
        },
        magicLinkId: '12345'
      })
      expect(res).toBeDefined()
      // @ts-expect-error - dynamic field names
      expect(res.state.formField1).toBe('val1')
      // @ts-expect-error - dynamic field names
      expect(res.state.formField2).toBe('val2')
      expect(res.form.slug).toBe('my-first-form')
    })
  })

  describe('validateSavedLink', () => {
    test('should throw if missing link)', async () => {
      // @ts-expect-error - missing link value
      await expect(validateSavedLink(undefined)).rejects.toThrow(
        'Invalid magic link'
      )
    })

    test('should throw if link not found)', async () => {
      // @ts-expect-error - missing record value
      jest.mocked(getSaveAndExitRecord).mockResolvedValue(undefined)
      await expect(validateSavedLink('12345')).rejects.toThrow(
        'Invalid magic link'
      )
    })

    test('should return valid result)', async () => {
      jest.mocked(getSaveAndExitRecord).mockResolvedValue({
        data: {
          // @ts-expect-error - partial record value
          form: {
            id: '1234'
          },
          security: {
            question: SecurityQuestionsEnum.MemorablePlace,
            answer: ''
          }
        }
      })
      const res = await validateSavedLink('123456')
      expect(res).toEqual({ formId: '1234', question: 'memorable-place' })
    })
  })
})

/**
 * @import { WithId } from 'mongodb'
 * @import { RunnerRecordFull } from '~/src/repositories/save-and-exit-repository.js'
 */
