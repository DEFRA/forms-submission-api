const mockErrorFn = jest.fn()
const mockWarnFn = jest.fn()
const mockInfoFn = jest.fn()

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: jest.fn().mockReturnValue({
    error: mockErrorFn,
    warn: mockWarnFn,
    info: mockInfoFn
  })
}))

const mockInitialiseEmailExpiringSoonScheduler = jest.fn()
jest.mock('~/src/services/scheduler.js', () => ({
  initialiseEmailExpiringSoonScheduler: mockInitialiseEmailExpiringSoonScheduler
}))

const mockGetErrorMessage = jest.fn()
jest.mock('@defra/forms-model', () => ({
  getErrorMessage: mockGetErrorMessage
}))

describe('scheduler plugin', () => {
  /** @type {SchedulerModule} */
  let schedulerModule
  /** @type {Scheduler} */
  let scheduler

  const mockSchedulerService = {
    start: jest.fn(),
    stop: jest.fn()
  }

  const mockRuntimeId = 'test-runtime-id-123'

  const server = {
    app: /** @type {any} */ ({ runtimeId: mockRuntimeId }),
    logger: {
      error: mockErrorFn,
      info: mockInfoFn
    },
    events: {
      on: jest.fn()
    }
  }

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()

    // Reset server.app with runtimeId between tests
    server.app = /** @type {any} */ ({ runtimeId: mockRuntimeId })

    schedulerModule = await import('~/src/plugins/scheduler.js')
    scheduler = schedulerModule.scheduler
  })

  describe('plugin registration', () => {
    test('should have correct plugin metadata', () => {
      expect(scheduler.plugin.name).toBe('scheduler')
      expect(scheduler.plugin.version).toBe('1.0.0')
    })

    test('should successfully register when scheduler is enabled', () => {
      mockInitialiseEmailExpiringSoonScheduler.mockReturnValue(
        mockSchedulerService
      )

      scheduler.plugin.register(/** @type {any} */ (server))

      expect(mockInitialiseEmailExpiringSoonScheduler).toHaveBeenCalled()

      expect(mockSchedulerService.start).toHaveBeenCalled()

      expect(server.app.scheduler).toBe(mockSchedulerService)

      expect(server.events.on).toHaveBeenCalledWith(
        'stop',
        expect.any(Function)
      )
    })

    test('should handle when scheduler is disabled via configuration', () => {
      mockInitialiseEmailExpiringSoonScheduler.mockReturnValue(null)

      scheduler.plugin.register(/** @type {any} */ (server))

      expect(mockInitialiseEmailExpiringSoonScheduler).toHaveBeenCalled()

      expect(mockSchedulerService.start).not.toHaveBeenCalled()

      expect(server.app.scheduler).toBeNull()

      expect(mockInfoFn).toHaveBeenCalledWith(
        '[SchedulerPlugin] Scheduler disabled via configuration'
      )

      expect(server.events.on).not.toHaveBeenCalled()
    })

    test('should handle and rethrow initialization errors', () => {
      const testError = new Error('Initialization failed')
      mockInitialiseEmailExpiringSoonScheduler.mockImplementation(() => {
        throw testError
      })
      mockGetErrorMessage.mockReturnValue('Initialization failed')

      expect(() => {
        scheduler.plugin.register(/** @type {any} */ (server))
      }).toThrow(testError)

      expect(mockErrorFn).toHaveBeenCalledWith(
        new Error('Initialization failed'),
        '[SchedulerPlugin] Failed to initialize scheduler: Initialization failed'
      )

      expect(server.app.scheduler).toBeUndefined()

      expect(server.events.on).not.toHaveBeenCalled()
    })
  })

  describe('server stop event handler', () => {
    test('should stop scheduler on server shutdown', () => {
      mockInitialiseEmailExpiringSoonScheduler.mockReturnValue(
        mockSchedulerService
      )

      scheduler.plugin.register(/** @type {any} */ (server))

      expect(server.events.on).toHaveBeenCalledWith(
        'stop',
        expect.any(Function)
      )
      const stopHandler = server.events.on.mock.calls[0][1]

      mockInfoFn.mockClear()
      mockSchedulerService.stop.mockClear()

      stopHandler()

      expect(mockInfoFn).toHaveBeenCalledWith(
        '[SchedulerPlugin] Stopping scheduler due to server shutdown'
      )

      expect(mockSchedulerService.stop).toHaveBeenCalled()
    })

    test('should not register stop handler when scheduler is disabled', () => {
      mockInitialiseEmailExpiringSoonScheduler.mockReturnValue(null)

      scheduler.plugin.register(/** @type {any} */ (server))

      expect(server.events.on).not.toHaveBeenCalled()
    })
  })

  describe('scheduler service integration', () => {
    test('should call initialiseEmailExpiringSoonScheduler', () => {
      mockInitialiseEmailExpiringSoonScheduler.mockReturnValue(
        mockSchedulerService
      )

      scheduler.plugin.register(/** @type {any} */ (server))

      expect(mockInitialiseEmailExpiringSoonScheduler).toHaveBeenCalledTimes(1)
    })

    test('should handle scheduler service methods correctly', () => {
      const customSchedulerService = {
        start: jest.fn(),
        stop: jest.fn()
      }
      mockInitialiseEmailExpiringSoonScheduler.mockReturnValue(
        customSchedulerService
      )

      scheduler.plugin.register(/** @type {any} */ (server))

      expect(customSchedulerService.start).toHaveBeenCalledTimes(1)

      const stopHandler = server.events.on.mock.calls[0][1]
      stopHandler()

      expect(customSchedulerService.stop).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    test('should handle getErrorMessage throwing an error', () => {
      const testError = new Error('Original error')
      mockInitialiseEmailExpiringSoonScheduler.mockImplementation(() => {
        throw testError
      })
      const getErrorMessageError = new Error('getErrorMessage failed')
      mockGetErrorMessage.mockImplementation(() => {
        throw getErrorMessageError
      })

      expect(() => {
        scheduler.plugin.register(/** @type {any} */ (server))
      }).toThrow(getErrorMessageError)

      expect(mockGetErrorMessage).toHaveBeenCalledWith(testError)
    })

    test('should preserve original error when thrown', () => {
      const customError = new TypeError('Type error occurred')
      mockInitialiseEmailExpiringSoonScheduler.mockImplementation(() => {
        throw customError
      })
      mockGetErrorMessage.mockReturnValue('Type error occurred')

      expect(() => {
        scheduler.plugin.register(/** @type {any} */ (server))
      }).toThrow(customError)

      expect(mockErrorFn).toHaveBeenCalledWith(
        new Error('Type error occurred'),
        '[SchedulerPlugin] Failed to initialize scheduler: Type error occurred'
      )
    })

    test('should throw error when runtimeId is not set in server.app', () => {
      // Temporarily remove runtimeId
      server.app = /** @type {any} */ ({})

      expect(() => {
        scheduler.plugin.register(/** @type {any} */ (server))
      }).toThrow('Runtime ID not found in server application state')
    })
  })
})

/**
 * @typedef {typeof SchedulerModuleDefinitionStar} SchedulerModule
 */
/**
 * @typedef {SchedulerTypeDefinition} Scheduler
 */

/**
 * @import * as SchedulerModuleDefinitionStar from '~/src/plugins/scheduler.js'
 * @import { scheduler as SchedulerTypeDefinition } from '~/src/plugins/scheduler.js'
 */
