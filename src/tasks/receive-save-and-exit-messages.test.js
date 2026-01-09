import {
  receiveMessageTimeout,
  receiveMessages
} from '~/src/messaging/event.js'
import { processSaveAndExitEvents } from '~/src/services/save-and-exit-events.js'
import {
  runTask,
  runTaskOnce
} from '~/src/tasks/receive-save-and-exit-messages.js'

jest.mock('~/src/messaging/event.js')
jest.mock('~/src/services/save-and-exit-events.js')

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: jest.fn().mockImplementation(() => {
    return {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }
  })
}))

describe('receive-messages', () => {
  const message = /** @type {Message} */ ({
    MessageId: 'ea9c724f-2292-4ccd-93b2-86653dca9de2',
    ReceiptHandle: 'ReceiptHandleXFES',
    MD5OfBody: 'adflkjasdJLIm',
    Body: 'hello world',
    MessageAttributes: {}
  })

  /**
   * @returns {void}
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  function voidFn() {}

  describe('runTaskOnce', () => {
    it('should save and delete new messages', async () => {
      const receivedMessageResult = /** @type {ReceiveMessageResult} */ ({
        Messages: [message]
      })
      const processedEventResult = {
        failed: [],
        processed: [message]
      }
      jest.mocked(receiveMessages).mockResolvedValueOnce(receivedMessageResult)
      jest
        .mocked(processSaveAndExitEvents)
        .mockResolvedValueOnce(processedEventResult)
      await runTaskOnce()
      expect(processSaveAndExitEvents).toHaveBeenCalledWith([message])
    })

    it('should handle undefined messages', async () => {
      jest.mocked(receiveMessages).mockResolvedValueOnce({})
      await runTaskOnce()
      expect(processSaveAndExitEvents).not.toHaveBeenCalled()
    })
  })

  describe('runTask', () => {
    it('should keep running', async () => {
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        // @ts-expect-error - mocking timeout with void
        .mockImplementation(voidFn)

      jest.mocked(receiveMessages).mockResolvedValueOnce({
        Messages: []
      })
      jest.mocked(processSaveAndExitEvents).mockResolvedValueOnce({
        failed: [],
        processed: []
      })
      await runTask()
      expect(setTimeoutSpy).toHaveBeenCalledWith(runTask, receiveMessageTimeout)
    })

    it('should fail gracefully if runTaskOnce errors', async () => {
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        // @ts-expect-error - mocking timeout with void
        .mockImplementation(voidFn)
      jest.mocked(receiveMessages).mockRejectedValue(new Error('any error'))
      await runTask()
      expect(setTimeoutSpy).toHaveBeenCalledWith(runTask, receiveMessageTimeout)
    })
  })
})

/**
 * @import { ReceiveMessageResult, Message } from '@aws-sdk/client-sqs'
 */
