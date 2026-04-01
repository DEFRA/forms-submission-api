import { postJson } from '~/src/services/httpService.js'
import { NOTIFY_ENDPOINT, sendNotification } from '~/src/services/notify.js'

jest.mock('~/src/services/httpService.js')

/**
 * Creates a minimal mock response
 * @param {{statusCode?: number}} [props]
 * @returns {IncomingMessage}
 */
function createMockResponse(props = {}) {
  return /** @type {IncomingMessage} */ ({
    statusCode: props.statusCode,
    headers: {}
  })
}

const defaultArgs = {
  templateId: '123456',
  emailAddress: 'my-email@test.com',
  personalisation: { subject: 'email-subject', body: 'email-body' },
  emailReplyToId: '123456'
}

describe('sendNotification', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should call Notify', async () => {
    jest.mocked(postJson).mockResolvedValueOnce({
      response: createMockResponse({ statusCode: 200 }),
      body: {}
    })
    const result = await sendNotification(defaultArgs)
    expect(result.response).toEqual({
      statusCode: 200,
      headers: {}
    })

    expect(postJson).toHaveBeenCalledWith(new URL(NOTIFY_ENDPOINT), {
      payload: {
        template_id: defaultArgs.templateId,
        email_address: defaultArgs.emailAddress,
        personalisation: defaultArgs.personalisation,
        email_reply_to_id: '123456'
      },
      headers: { Authorization: expect.any(String) }
    })
  })

  it('should retry on failure and succeed on subsequent attempt', async () => {
    jest
      .mocked(postJson)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        response: createMockResponse({ statusCode: 200 }),
        body: {}
      })

    const promise = sendNotification(defaultArgs)

    // Advance past the first retry delay (1000ms)
    await jest.advanceTimersByTimeAsync(1000)

    const result = await promise
    expect(result.response.statusCode).toBe(200)
    expect(postJson).toHaveBeenCalledTimes(2)
  })

  it('should retry multiple times with exponential backoff', async () => {
    jest
      .mocked(postJson)
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockResolvedValueOnce({
        response: createMockResponse({ statusCode: 200 }),
        body: {}
      })

    const promise = sendNotification(defaultArgs)

    // First retry delay: 1000ms
    await jest.advanceTimersByTimeAsync(1000)
    // Second retry delay: 2000ms
    await jest.advanceTimersByTimeAsync(2000)

    const result = await promise
    expect(result.response.statusCode).toBe(200)
    expect(postJson).toHaveBeenCalledTimes(3)
  })

  it('should throw the last error after all retries are exhausted', async () => {
    const finalError = new Error('Persistent failure')
    jest
      .mocked(postJson)
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockRejectedValueOnce(new Error('Error 3'))
      .mockRejectedValueOnce(finalError)

    /** @type {Error | undefined} */
    let caughtError
    const promise = sendNotification(defaultArgs).catch(
      (/** @type {unknown} */ err) => {
        caughtError = /** @type {Error} */ (err)
      }
    )

    // Advance timers enough to cover all retry delays (1s + 2s + 4s)
    await jest.advanceTimersByTimeAsync(7000)
    await promise

    expect(caughtError).toBe(finalError)
    expect(postJson).toHaveBeenCalledTimes(4)
  })

  it('should include Authorization header with Bearer token', async () => {
    jest.mocked(postJson).mockResolvedValueOnce({
      response: createMockResponse({ statusCode: 200 }),
      body: {}
    })

    await sendNotification(defaultArgs)

    const call = jest.mocked(postJson).mock.calls[0]
    const options = /** @type {{ headers: { Authorization: string } }} */ (
      call[1]
    )
    expect(options.headers.Authorization).toMatch(/^Bearer /)
  })
})

/**
 * @import { IncomingMessage } from 'node:http'
 */
