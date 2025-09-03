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

describe('sendNotification', () => {
  const OLD_ENV = { ...process.env }

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('should call Notify', async () => {
    jest.mocked(postJson).mockResolvedValueOnce({
      response: createMockResponse({ statusCode: 200 }),
      body: {}
    })
    const args = {
      templateId: '123456',
      emailAddress: 'my-email@test.com',
      personalisation: { subject: 'email-subject', body: 'email-body' }
    }
    const result = await sendNotification(args)
    expect(result.response).toEqual({
      statusCode: 200,
      headers: {}
    })

    expect(postJson).toHaveBeenCalledWith(new URL(NOTIFY_ENDPOINT), {
      payload: {
        template_id: args.templateId,
        email_address: args.emailAddress,
        personalisation: args.personalisation
      },
      headers: { Authorization: expect.any(String) }
    })
  })
})

/**
 * @import { IncomingMessage } from 'node:http'
 */
