import { logListener } from '~/src/plugins/forward-logs.js'

describe('forwardLogs', () => {
  /** @type {pino.Logger} */
  let logger

  beforeEach(() => {
    const info = jest.fn()
    const error = jest.fn()

    logger = /** @type {pino.Logger} */ (
      /** @type {unknown} */ ({ error, info })
    )
  })

  it('logs info with string data', () => {
    logListener(
      logger,
      /** @type {RequestEvent} */ ({
        channel: 'app',
        timestamp: Date.now().toString(),
        tags: ['a', 'b', 'c'],
        data: 'My log msg'
      }),
      { a: true, b: true, c: true }
    )

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      'Channel: app, Tags: [a,b,c], Data: My log msg'
    )
  })

  it('logs info with undefined data', () => {
    logListener(
      logger,
      /** @type {RequestEvent} */ ({
        channel: 'app',
        timestamp: Date.now().toString(),
        tags: ['a', 'b', 'c']
      }),
      { a: true, b: true, c: true }
    )

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      'Channel: app, Tags: [a,b,c], Data: type - undefined'
    )
  })

  it('logs info with object data', () => {
    logListener(
      logger,
      /** @type {RequestEvent} */ ({
        channel: 'app',
        timestamp: Date.now().toString(),
        tags: ['a', 'b', 'c'],
        data: { some: 'data' }
      }),
      { a: true, b: true, c: true }
    )

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      'Channel: app, Tags: [a,b,c], Data: type - object'
    )
  })

  it('logs info with function data', () => {
    logListener(
      logger,
      /** @type {RequestEvent} */ ({
        channel: 'app',
        timestamp: Date.now().toString(),
        tags: ['a', 'b', 'c'],
        data: () => {
          ''
        }
      }),
      { a: true, b: true, c: true }
    )

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      'Channel: app, Tags: [a,b,c], Data: type - function'
    )
  })

  it('logs errors with string data', () => {
    const error = new Error('Some error')

    logListener(
      logger,
      /** @type {RequestEvent} */ ({
        channel: 'app',
        timestamp: Date.now().toString(),
        tags: ['a', 'b', 'c', 'error'],
        error
      }),
      { a: true, b: true, c: true, error: true }
    )

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      error,
      'Channel: app, Tags: [a,b,c,error], Error: Some error'
    )
  })

  it('does not log internal errors', () => {
    const error = new Error('Some error')

    logListener(
      logger,
      /** @type {RequestEvent} */ ({
        channel: 'internal',
        timestamp: Date.now().toString(),
        tags: ['a', 'b', 'c', 'error'],
        error
      }),
      { a: true, b: true, c: true, error: true }
    )

    expect(logger.error).not.toHaveBeenCalled()
  })
})

/**
 * @import pino from 'pino'
 * @import { RequestEvent } from '@hapi/hapi'
 */
