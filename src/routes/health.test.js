import { createServer } from '~/src/api/server.js'

jest.mock('~/src/mongo.js')

describe('Health route', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(() => {
    return server.stop()
  })

  const okStatusCode = 200
  const jsonContentType = 'application/json'

  describe('Success responses', () => {
    test('Testing GET /health route returns 200', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      })

      expect(response.statusCode).toEqual(okStatusCode)
      expect(response.headers['content-type']).toContain(jsonContentType)
      expect(response.result).toEqual({ message: 'success' })
    })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
