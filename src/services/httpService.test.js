import Boom from '@hapi/boom'
import Wreck from '@hapi/wreck'

import {
  del,
  delJson,
  get,
  getJson,
  patch,
  patchJson,
  post,
  postJson,
  put,
  putJson,
  request
} from '~/src/services/httpService.js'

jest.mock('@hapi/wreck')

describe('httpService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('request', () => {
    it('should return response and body for successful request', async () => {
      /** @type {any} */
      const mockResponse = { statusCode: 200, headers: {} }
      const mockBody = { data: 'test' }

      jest.mocked(Wreck.request).mockResolvedValue(mockResponse)
      jest.mocked(Wreck.read).mockResolvedValue(mockBody)

      const url = new URL('http://example.com/api')
      const result = await request('get', url, {})

      expect(result).toEqual({ response: mockResponse, body: mockBody })
      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'get',
        'http://example.com/api',
        {}
      )
      expect(jest.mocked(Wreck.read)).toHaveBeenCalledWith(mockResponse, {})
    })

    it('should throw Boom error for non-200 status with message in body', async () => {
      /** @type {any} */
      const mockResponse = { statusCode: 404 }
      const mockBody = { message: 'Not found', cause: 'Resource missing' }

      jest.mocked(Wreck.request).mockResolvedValue(mockResponse)
      jest.mocked(Wreck.read).mockResolvedValue(mockBody)

      const url = new URL('http://example.com/api')

      await expect(request('get', url, {})).rejects.toThrow(
        Boom.boomify(new Error('Not found', { cause: 'Resource missing' }), {
          statusCode: 404,
          data: mockBody
        })
      )
    })

    it('should throw Boom error for non-200 status with message but no cause', async () => {
      /** @type {any} */
      const mockResponse = { statusCode: 400 }
      const mockBody = { message: 'Bad Request' }

      jest.mocked(Wreck.request).mockResolvedValue(mockResponse)
      jest.mocked(Wreck.read).mockResolvedValue(mockBody)

      const url = new URL('http://example.com/api')

      await expect(request('get', url, {})).rejects.toThrow(
        Boom.boomify(new Error('Bad Request'), {
          statusCode: 400,
          data: mockBody
        })
      )
    })

    it('should throw Boom error for non-200 status without message in body', async () => {
      /** @type {any} */
      const mockResponse = { statusCode: 500 }
      const mockBody = { data: 'some data' }

      jest.mocked(Wreck.request).mockResolvedValue(mockResponse)
      jest.mocked(Wreck.read).mockResolvedValue(mockBody)

      const url = new URL('http://example.com/api')

      await expect(request('get', url, {})).rejects.toThrow(
        Boom.boomify(new Error('HTTP status code 500'), {
          statusCode: 500,
          data: mockBody
        })
      )
    })
  })

  describe('HTTP method wrappers', () => {
    const url = new URL('http://example.com/api')
    const options = { headers: { 'X-Test': 'value' } }
    /** @type {any} */
    const mockResponse = { statusCode: 200 }
    const mockBody = { success: true }

    beforeEach(() => {
      jest.mocked(Wreck.request).mockResolvedValue(mockResponse)
      jest.mocked(Wreck.read).mockResolvedValue(mockBody)
    })

    it('get should call request with correct method', async () => {
      const result = await get(url, options)

      expect(result).toEqual({ response: mockResponse, body: mockBody })
      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'get',
        url.href,
        options
      )
    })

    it('post should call request with correct method', async () => {
      const result = await post(url, options)

      expect(result).toEqual({ response: mockResponse, body: mockBody })
      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'post',
        url.href,
        options
      )
    })

    it('put should call request with correct method', async () => {
      const result = await put(url, options)

      expect(result).toEqual({ response: mockResponse, body: mockBody })
      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'put',
        url.href,
        options
      )
    })

    it('patch should call request with correct method', async () => {
      const result = await patch(url, options)

      expect(result).toEqual({ response: mockResponse, body: mockBody })
      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'patch',
        url.href,
        options
      )
    })

    it('del should call request with correct method', async () => {
      const result = await del(url, options)

      expect(result).toEqual({ response: mockResponse, body: mockBody })
      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'delete',
        url.href,
        options
      )
    })
  })

  describe('JSON method wrappers', () => {
    const url = new URL('http://example.com/api')
    /** @type {any} */
    const mockResponse = { statusCode: 200 }
    const mockBody = { data: 'test' }

    beforeEach(() => {
      jest.mocked(Wreck.request).mockResolvedValue(mockResponse)
      jest.mocked(Wreck.read).mockResolvedValue(mockBody)
    })

    it('getJson should add json: true to options', async () => {
      await getJson(url, { headers: { 'X-Test': 'value' } })

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith('get', url.href, {
        json: true,
        headers: { 'X-Test': 'value' }
      })
    })

    it('postJson should add json: true to options', async () => {
      await postJson(url, { payload: { test: 'data' } })

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'post',
        url.href,
        {
          json: true,
          payload: { test: 'data' }
        }
      )
    })

    it('postJson should work with no options provided', async () => {
      await postJson(url)

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'post',
        url.href,
        {
          json: true
        }
      )
    })

    it('putJson should add json: true to options', async () => {
      await putJson(url, { payload: { test: 'data' } })

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith('put', url.href, {
        json: true,
        payload: { test: 'data' }
      })
    })

    it('putJson should work with no options provided', async () => {
      await putJson(url)

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith('put', url.href, {
        json: true
      })
    })

    it('patchJson should add json: true to options', async () => {
      await patchJson(url, { payload: { test: 'data' } })

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'patch',
        url.href,
        {
          json: true,
          payload: { test: 'data' }
        }
      )
    })

    it('patchJson should work with no options provided', async () => {
      await patchJson(url)

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'patch',
        url.href,
        {
          json: true
        }
      )
    })

    it('delJson should add json: true to options', async () => {
      await delJson(url)

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith(
        'delete',
        url.href,
        {
          json: true
        }
      )
    })

    it('getJson should work with empty options', async () => {
      await getJson(url)

      expect(jest.mocked(Wreck.request)).toHaveBeenCalledWith('get', url.href, {
        json: true
      })
    })
  })
})
