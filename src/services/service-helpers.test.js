import { jest } from '@jest/globals'

import * as repository from '~/src/repositories/file-repository.js'
import {
  createMainCsvFile,
  createRepeaterCsvFile,
  processRepeaterFiles
} from '~/src/services/service-helpers.js'
import { createCsv, createS3File, getS3Client } from '~/src/services/utils.js'

jest.mock('~/src/services/utils.js')
jest.mock('~/src/repositories/file-repository.js')

describe('Service Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createCsv).mockImplementation((input) => {
      if (input.length === 0) return Promise.resolve('')
      return Promise.resolve(
        input.map((row) => row.join(',')).join('\n') + '\n'
      )
    })
    /** @type {any} */
    const mockS3Client = {
      send: /** @type {any} */ (jest.fn()).mockResolvedValue({ $metadata: {} })
    }
    jest.mocked(getS3Client).mockReturnValue(mockS3Client)
    jest.mocked(createS3File).mockResolvedValue(
      /** @type {any} */ ({
        $metadata: { httpStatusCode: 200 }
      })
    )
    jest.mocked(repository.create).mockResolvedValue(undefined)
  })

  const form = {
    id: 'form-id',
    name: 'Form Name',
    slug: 'form-slug'
  }

  describe('createMainCsvFile', () => {
    const mockMain = [
      { name: 'field1', title: 'Field 1', value: 'value1' },
      { name: 'field2', title: 'Field 2', value: 'value2' }
    ]

    it('should create main CSV file successfully', async () => {
      const result = await createMainCsvFile(form, mockMain, 'hashed-key', true)

      expect(typeof result).toBe('string')
      expect(result).toMatch(/^[a-f0-9-]{36}$/) // UUID format

      expect(createCsv).toHaveBeenCalledWith([
        ['Field 1', 'Field 2'],
        ['value1', 'value2']
      ])

      expect(createS3File).toHaveBeenCalledWith(
        expect.stringContaining('loaded/'),
        'Field 1,Field 2\nvalue1,value2\n',
        'text/csv',
        expect.any(Object)
      )

      expect(repository.create).toHaveBeenCalledWith({
        fileId: result,
        filename: `${result}.csv`,
        contentType: 'text/csv',
        s3Key: expect.stringContaining('loaded/'),
        s3Bucket: expect.any(String),
        retrievalKey: 'hashed-key',
        retrievalKeyIsCaseSensitive: true,
        form: {
          id: 'form-id',
          name: 'Form Name',
          slug: 'form-slug'
        }
      })
    })

    it('should handle S3 upload failures', async () => {
      const s3Error = new Error('S3 upload failed')
      jest.mocked(createS3File).mockRejectedValue(s3Error)

      await expect(
        createMainCsvFile(form, mockMain, 'hashed-key', true)
      ).rejects.toThrow('S3 upload failed')

      expect(repository.create).not.toHaveBeenCalled()
    })

    it('should handle repository creation failures', async () => {
      const dbError = new Error('Database error')
      jest.mocked(repository.create).mockRejectedValue(dbError)

      await expect(
        createMainCsvFile(form, mockMain, 'hashed-key', true)
      ).rejects.toThrow('Database error')
    })

    it('should handle empty main data', async () => {
      const result = await createMainCsvFile(form, [], 'hashed-key', false)

      expect(createCsv).toHaveBeenCalledWith([[], []])
      expect(result).toMatch(/^[a-f0-9-]{36}$/)
    })
  })

  describe('createRepeaterCsvFile', () => {
    const mockRepeater = {
      name: 'repeater1',
      title: 'Repeater 1',
      value: [
        [
          { name: 'field1', title: 'Field 1', value: 'row1-value1' },
          { name: 'field2', title: 'Field 2', value: 'row1-value2' }
        ],
        [
          { name: 'field1', title: 'Field 1', value: 'row2-value1' },
          { name: 'field2', title: 'Field 2', value: 'row2-value2' }
        ]
      ]
    }

    it('should create repeater CSV file successfully', async () => {
      const result = await createRepeaterCsvFile(
        form,
        mockRepeater,
        'hashed-key',
        false
      )

      expect(result).toEqual({
        name: 'repeater1',
        fileId: expect.stringMatching(/^[a-f0-9-]{36}$/)
      })

      expect(createCsv).toHaveBeenCalledWith([
        ['Field 1', 'Field 2'],
        ['row1-value1', 'row1-value2'],
        ['row2-value1', 'row2-value2']
      ])

      expect(createS3File).toHaveBeenCalledWith(
        expect.stringContaining('loaded/'),
        'Field 1,Field 2\nrow1-value1,row1-value2\nrow2-value1,row2-value2\n',
        'text/csv',
        expect.any(Object)
      )
    })

    it('should handle empty repeater data', async () => {
      const emptyRepeater = {
        name: 'empty',
        title: 'Empty',
        value: []
      }

      const result = await createRepeaterCsvFile(
        form,
        emptyRepeater,
        'hashed-key',
        false
      )

      expect(result.name).toBe('empty')
      expect(createCsv).toHaveBeenCalledWith([[]])
    })

    it('should handle S3 upload failures', async () => {
      const s3Error = new Error('S3 repeater upload failed')
      jest.mocked(createS3File).mockRejectedValue(s3Error)

      await expect(
        createRepeaterCsvFile(form, mockRepeater, 'hashed-key', false)
      ).rejects.toThrow('S3 repeater upload failed')
    })
  })

  describe('processRepeaterFiles', () => {
    const mockRepeaters = [
      {
        name: 'repeater1',
        title: 'Repeater 1',
        value: [[{ name: 'field1', title: 'Field 1', value: 'r1-value1' }]]
      },
      {
        name: 'repeater2',
        title: 'Repeater 2',
        value: [[{ name: 'field2', title: 'Field 2', value: 'r2-value1' }]]
      }
    ]

    it('should process all repeater files successfully', async () => {
      const result = await processRepeaterFiles(
        form,
        mockRepeaters,
        'hashed-key',
        true
      )

      expect(result).toEqual({
        repeater1: expect.stringMatching(/^[a-f0-9-]{36}$/),
        repeater2: expect.stringMatching(/^[a-f0-9-]{36}$/)
      })

      expect(createS3File).toHaveBeenCalledTimes(2)
      expect(repository.create).toHaveBeenCalledTimes(2)
    })

    it('should handle empty repeaters array', async () => {
      const result = await processRepeaterFiles(form, [], 'hashed-key', true)

      expect(result).toEqual({})
      expect(createS3File).not.toHaveBeenCalled()
      expect(repository.create).not.toHaveBeenCalled()
    })

    it('should throw error if some repeater files fail', async () => {
      jest
        .mocked(createS3File)
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } })
        .mockRejectedValueOnce(new Error('S3 failure'))

      await expect(
        processRepeaterFiles(form, mockRepeaters, 'hashed-key', true)
      ).rejects.toThrow('Failed to save repeater files')

      expect(createS3File).toHaveBeenCalledTimes(2)
    })

    it('should throw error if all repeater files fail', async () => {
      jest.mocked(createS3File).mockRejectedValue(new Error('All failed'))

      await expect(
        processRepeaterFiles(form, mockRepeaters, 'hashed-key', true)
      ).rejects.toThrow('Failed to save repeater files')
    })
  })
})

/**
 * @import { SubmitRecordset } from '@defra/forms-model'
 */
