import {
  createLogContext,
  getCorrelationId,
  getUserId,
  runWithLogContext
} from '@defra/forms-common'
import { getTraceId } from '@defra/hapi-tracing'
import hapi from '@hapi/hapi'

import {
  applyTraceHeaders,
  getRequestUserId,
  requestTracing
} from '~/src/helpers/request-tracing.js'

describe('request-tracing', () => {
  const tracingHeader = 'x-cdp-request-id'
  const correlationId = '1066e8cc-8e1e-4671-8ad7-b4cd9c95bb94'
  const userId = '86758ba9-92e7-4287-9751-7705e449f0a5'

  describe('plugin', () => {
    /** @type {Server} */
    let server

    /** @type {{ correlationId?: string, userId?: string }} */
    let responseContext

    beforeEach(async () => {
      server = hapi.server()
      responseContext = {}

      server.auth.scheme('test', () => ({
        authenticate(request, h) {
          return h.authenticated({ credentials: { user: { oid: userId } } })
        }
      }))
      server.auth.strategy('test', 'test')

      await server.register(requestTracing)

      const handler = () => ({
        correlationId: getCorrelationId(),
        traceId: getTraceId(),
        userId: getUserId()
      })

      server.route([
        { method: 'GET', path: '/open', handler },
        {
          method: 'GET',
          path: '/secure',
          handler,
          options: { auth: 'test' }
        }
      ])

      // The response log is written when this event is emitted
      server.events.on('response', () => {
        responseContext = {
          correlationId: getCorrelationId(),
          userId: getUserId()
        }
      })
    })

    afterEach(async () => {
      await server.stop()
    })

    it('should use the correlation ID from the tracing header', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/open',
        headers: { [tracingHeader]: correlationId }
      })

      expect(result).toEqual({
        correlationId,
        traceId: correlationId,
        userId: undefined
      })
      expect(responseContext).toEqual({ correlationId, userId: undefined })
    })

    it('should add the ID of the authenticated user', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/secure',
        headers: { [tracingHeader]: correlationId }
      })

      expect(result).toEqual({
        correlationId,
        traceId: correlationId,
        userId
      })
      expect(responseContext).toEqual({ correlationId, userId })
    })
  })

  describe('getRequestUserId', () => {
    /**
     * @param {Partial<RequestAuth>} auth
     */
    function buildRequest(auth) {
      return /** @type {Request} */ (/** @type {unknown} */ ({ auth }))
    }

    it('should return the oid of a staff user', () => {
      const request = buildRequest({
        isAuthenticated: true,
        credentials: { user: { oid: userId, sub: 'sub' } }
      })

      expect(getRequestUserId(request)).toBe(userId)
    })

    it('should return the sub of a citizen', () => {
      const request = buildRequest({
        isAuthenticated: true,
        credentials: { user: { sub: userId } }
      })

      expect(getRequestUserId(request)).toBe(userId)
    })

    it('should return undefined for an app client', () => {
      const request = buildRequest({
        isAuthenticated: true,
        credentials: { app: { client_id: 'client-id' } }
      })

      expect(getRequestUserId(request)).toBeUndefined()
    })

    it('should return undefined when the request is not authenticated', () => {
      const request = buildRequest({
        isAuthenticated: false,
        credentials: { user: { oid: userId } }
      })

      expect(getRequestUserId(request)).toBeUndefined()
    })
  })

  describe('applyTraceHeaders', () => {
    it('should return the headers unchanged outside of a log context', () => {
      const headers = { accept: 'application/json' }

      expect(applyTraceHeaders(headers)).toBe(headers)
      expect(applyTraceHeaders(undefined)).toBeUndefined()
    })

    it('should add the tracing header', () => {
      runWithLogContext(createLogContext({ correlationId }), () => {
        expect(applyTraceHeaders({ accept: 'application/json' })).toEqual({
          accept: 'application/json',
          [tracingHeader]: correlationId
        })
        expect(applyTraceHeaders(undefined)).toEqual({
          [tracingHeader]: correlationId
        })
      })
    })
  })
})

/**
 * @import { Request, RequestAuth, Server } from '@hapi/hapi'
 */
