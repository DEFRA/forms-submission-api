import { jest } from '@jest/globals'

import * as repository from '~/src/repositories/file-repository.js'
import { createMainCsvFile } from '~/src/services/service-helpers.js'
import { createCsv, createS3File, getS3Client } from '~/src/services/utils.js'

jest.mock('~/src/services/utils.js')
jest.mock('~/src/repositories/file-repository.js')
jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}))

describe('Service Helpers more', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createCsv).mockImplementation((input) => {
      if (input.length === 0) return Promise.resolve('')
      return Promise.resolve(
        input.map((row) => /** @type {any} */ (row).join(',')).join('\n') + '\n'
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

  it('should create main CSV without ref-num', async () => {
    const mockMain = [
      { name: 'field1', title: 'Field 1', value: 'value1' },
      { name: 'field2', title: 'Field 2', value: 'value2' }
    ]
    const result = await createMainCsvFile(
      mockMain,
      'hashed-key',
      true,
      undefined
    )

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
      retrievalKeyIsCaseSensitive: true
    })
  })
})
