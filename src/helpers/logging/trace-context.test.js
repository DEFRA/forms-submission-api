import { getTraceId } from '@defra/hapi-tracing'

import {
  getCurrentTraceId,
  runWithTraceId,
  traceHeaders
} from '~/src/helpers/logging/trace-context.js'

jest.mock('@defra/hapi-tracing', () => ({
  getTraceId: jest.fn()
}))

describe('trace context', () => {
  beforeEach(() => {
    jest.mocked(getTraceId).mockReturnValue(undefined)
  })

  it('has no trace id outside a request or message', () => {
    expect(getCurrentTraceId()).toBeUndefined()
    expect(traceHeaders()).toEqual({})
  })

  it('uses the trace id of the message being processed', async () => {
    const seen = await runWithTraceId('message-trace', async () => {
      await Promise.resolve()
      return getCurrentTraceId()
    })

    expect(seen).toBe('message-trace')
    expect(getCurrentTraceId()).toBeUndefined()
  })

  it('prefers the trace id of an HTTP request', () => {
    jest.mocked(getTraceId).mockReturnValue('request-trace')

    expect(runWithTraceId('message-trace', getCurrentTraceId)).toBe(
      'request-trace'
    )
  })

  it('keeps the trace ids of messages processed at the same time apart', async () => {
    /** @param {string} id */
    const work = (id) =>
      runWithTraceId(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, id === 'a' ? 5 : 0))
        return getCurrentTraceId()
      })

    await expect(Promise.all([work('a'), work('b')])).resolves.toEqual([
      'a',
      'b'
    ])
  })

  it('builds the tracing header for calls to our own services', () => {
    expect(runWithTraceId('trace-1', traceHeaders)).toEqual({
      'x-cdp-request-id': 'trace-1'
    })
  })

  it('sends no header when the tracing header is not configured', () => {
    jest.isolateModules(() => {
      const { config } = jest.requireActual('~/src/config/index.js')
      const previous = config.get('tracing.header')
      config.set('tracing.header', null)

      try {
        const isolated = jest.requireActual(
          '~/src/helpers/logging/trace-context.js'
        )
        expect(
          isolated.runWithTraceId('trace-1', isolated.traceHeaders)
        ).toEqual({})
      } finally {
        config.set('tracing.header', previous)
      }
    })
  })
})
