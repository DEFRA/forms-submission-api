import { FormStatus } from '@defra/forms-model'

import { FormRowStatus } from '~/src/constants.js'
import { getSubmissionRecordsForUser } from '~/src/repositories/submission-repository.js'
import {
  formRowSorter,
  getCombinedRecordsForUser
} from '~/src/services/combined-records-service.js'
import { getSaveAndExitRecordsForUser } from '~/src/services/save-and-exit-service.js'

jest.mock('~/src/repositories/submission-repository.js')
jest.mock('~/src/services/save-and-exit-service.js')

describe('combined-records-service', () => {
  const sub = 'a3f1c0de-0000-4000-8000-000000000001'
  const iss = 'https://identity.forms.example'
  const formId = '688131eeff67f889d52c66cc'

  /**
   * @param {FormRowStatus[keyof FormRowStatus]} status
   * @param {string} createdAt
   */
  const row = (status, createdAt) =>
    /** @type {any} */ ({ status, createdAt: new Date(createdAt) })

  describe('getCombinedRecordsForUser', () => {
    beforeEach(() => {
      jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValue([])
      jest.mocked(getSubmissionRecordsForUser).mockResolvedValue([])
      const now = new Date('2026-09-28T09:00:00.000Z')
      jest.useFakeTimers().setSystemTime(now)
    })

    afterAll(() => {
      jest.useRealTimers()
    })

    it('should return an empty array when there are no records', async () => {
      expect(await getCombinedRecordsForUser(sub, iss, formId)).toEqual([])
    })

    it('should pass the arguments to both sources', async () => {
      await getCombinedRecordsForUser(sub, iss, formId, FormStatus.Draft)

      expect(getSaveAndExitRecordsForUser).toHaveBeenCalledWith(
        sub,
        iss,
        formId,
        FormStatus.Draft
      )
      expect(getSubmissionRecordsForUser).toHaveBeenCalledWith(
        sub,
        iss,
        formId,
        FormStatus.Draft
      )
    })

    it('should pass an undefined preview state for a live form', async () => {
      await getCombinedRecordsForUser(sub, iss, formId)

      expect(getSaveAndExitRecordsForUser).toHaveBeenCalledWith(
        sub,
        iss,
        formId,
        undefined
      )
      expect(getSubmissionRecordsForUser).toHaveBeenCalledWith(
        sub,
        iss,
        formId,
        undefined
      )
    })

    it('should map and combine save-and-exit and submission records', async () => {
      jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValueOnce([
        {
          magicLinkId: 'link-1',
          formTitle: 'My form',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
          expireAt: new Date('2026-09-30T09:00:00.000Z'),
          isDeleted: undefined
        },
        {
          magicLinkId: 'link-2',
          formTitle: 'My form',
          createdAt: new Date('2026-09-03T09:00:00.000Z'),
          expireAt: new Date('2026-10-01T09:00:00.000Z'),
          isDeleted: true
        }
      ])
      jest.mocked(getSubmissionRecordsForUser).mockResolvedValueOnce([
        /** @type {any} */ ({
          meta: { referenceNumber: '123-456-789' },
          recordCreatedAt: new Date('2026-09-01T09:00:00.000Z')
        })
      ])

      const result = await getCombinedRecordsForUser(sub, iss, formId)

      expect(result).toEqual([
        {
          status: FormRowStatus.InProgress,
          magicLinkId: 'link-1',
          formTitle: 'My form',
          createdAt: new Date('2026-09-02T09:00:00.000Z'),
          expireAt: new Date('2026-09-30T09:00:00.000Z'),
          isDeleted: undefined
        },
        {
          status: FormRowStatus.Submitted,
          referenceNumber: '123-456-789',
          createdAt: new Date('2026-09-01T09:00:00.000Z')
        },
        {
          status: FormRowStatus.Deleted,
          magicLinkId: 'link-2',
          formTitle: 'My form',
          createdAt: new Date('2026-09-03T09:00:00.000Z'),
          expireAt: new Date('2026-10-01T09:00:00.000Z'),
          isDeleted: true
        }
      ])
    })

    it('should sort by status then newest first', async () => {
      jest.mocked(getSaveAndExitRecordsForUser).mockResolvedValueOnce([
        /** @type {any} */ ({
          magicLinkId: 'old-deleted',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          isDeleted: true
        }),
        /** @type {any} */ ({
          magicLinkId: 'old-progress',
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }),
        /** @type {any} */ ({
          magicLinkId: 'new-progress',
          createdAt: new Date('2026-02-01T00:00:00.000Z')
        })
      ])
      jest.mocked(getSubmissionRecordsForUser).mockResolvedValueOnce([
        /** @type {any} */ ({
          meta: { referenceNumber: 'old-sub' },
          recordCreatedAt: new Date('2026-01-01T00:00:00.000Z')
        }),
        /** @type {any} */ ({
          meta: { referenceNumber: 'new-sub' },
          recordCreatedAt: new Date('2026-02-01T00:00:00.000Z')
        })
      ])

      const result = await getCombinedRecordsForUser(sub, iss, formId)

      expect(result.map((r) => r.magicLinkId ?? r.referenceNumber)).toEqual([
        'new-progress',
        'old-progress',
        'new-sub',
        'old-sub',
        'old-deleted'
      ])
    })

    it('should reject when the save-and-exit lookup fails', async () => {
      jest
        .mocked(getSaveAndExitRecordsForUser)
        .mockRejectedValueOnce(new Error('save and exit failed'))

      await expect(getCombinedRecordsForUser(sub, iss, formId)).rejects.toThrow(
        'save and exit failed'
      )
    })

    it('should reject when the submission lookup fails', async () => {
      jest
        .mocked(getSubmissionRecordsForUser)
        .mockRejectedValueOnce(new Error('submission failed'))

      await expect(getCombinedRecordsForUser(sub, iss, formId)).rejects.toThrow(
        'submission failed'
      )
    })
  })

  describe('formRowSorter', () => {
    it('should order InProgress before Submitted before Deleted', () => {
      const date = '2026-01-01T00:00:00.000Z'
      const rows = [
        row(FormRowStatus.Deleted, date),
        row(FormRowStatus.Submitted, date),
        row(FormRowStatus.InProgress, date)
      ]

      expect(rows.sort(formRowSorter).map((r) => r.status)).toEqual([
        FormRowStatus.InProgress,
        FormRowStatus.Submitted,
        FormRowStatus.Deleted
      ])
    })

    it('should order rows of the same status by createdAt descending', () => {
      const older = row(FormRowStatus.Submitted, '2026-01-01T00:00:00.000Z')
      const newer = row(FormRowStatus.Submitted, '2026-02-01T00:00:00.000Z')

      expect(formRowSorter(older, newer)).toBeGreaterThan(0)
      expect(formRowSorter(newer, older)).toBeLessThan(0)
    })

    it('should return 0 for equal status and createdAt', () => {
      const a = row(FormRowStatus.Submitted, '2026-01-01T00:00:00.000Z')
      const b = row(FormRowStatus.Submitted, '2026-01-01T00:00:00.000Z')

      expect(formRowSorter(a, b)).toBe(0)
    })

    it('should rank an unknown status before known statuses', () => {
      const date = '2026-01-01T00:00:00.000Z'
      const unknown = row('Other', date)
      const inProgress = row(FormRowStatus.InProgress, date)

      expect(formRowSorter(unknown, inProgress)).toBeLessThan(0)
    })
  })
})
