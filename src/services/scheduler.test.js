import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import cron from 'node-cron'

import { config } from '~/src/config/index.js'
import {
  getSchedulerService,
  initialiseEmailExpiringSoonScheduler
} from '~/src/services/scheduler.js'

const createMockTask = () => ({
  start: jest.fn(),
  stop: jest.fn()
})

jest.mock('node-cron', () => ({
  default: {
    validate: jest.fn(),
    createTask: jest.fn()
  }
}))

jest.mock('~/src/config/index.js', () => ({
  config: {
    get: jest.fn((key) => {
      if (key === 'notifyAPIKey') {
        // Return a valid notify API key format (service-id-api-key-id-secret-key)
        return 'test-service-id-12345678901234567890123456789012-test-api-key-id-123456789012345678901234567890123456'
      }
      return undefined
    })
  }
}))

jest.mock('~/src/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}))

jest.mock('~/src/services/notify.js')
jest.mock('~/src/repositories/save-and-exit-repository.js')
jest.mock('~/src/services/forms-service.js')

describe('SchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    const mockTasks = /** @type {any[]} */ ([])
    const cronAny = /** @type {any} */ (cron)
    const configAny = /** @type {any} */ (config)

    cronAny.validate = jest.fn().mockReturnValue(true)
    cronAny.createTask = jest.fn().mockImplementation(() => {
      const task = createMockTask()
      mockTasks.push(task)
      return task
    })

    configAny.get = jest.fn().mockImplementation((key) => {
      if (key === 'emailUsersExpiringSoonSavedForLaterLink.enabled') {
        return true
      }
      if (key === 'emailUsersExpiringSoonSavedForLaterLink.cronSchedule') {
        return '0 9-20 * * *'
      }
      return undefined
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    const scheduler = getSchedulerService()
    scheduler.tasks.clear()
    scheduler.isInitialized = false
  })

  describe('scheduleTask', () => {
    test('should schedule a task successfully', () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest.fn()
      const result = scheduler.scheduleTask(
        'test-task',
        '* * * * *',
        taskFunction
      )

      expect(result).toBe(true)
      expect(cron.validate).toHaveBeenCalledWith('* * * * *')
      expect(cron.createTask).toHaveBeenCalled()
      expect(scheduler.tasks.has('test-task')).toBe(true)
    })

    test('should reject duplicate task names', () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest.fn()
      scheduler.scheduleTask('duplicate-task', '* * * * *', taskFunction)

      const result = scheduler.scheduleTask(
        'duplicate-task',
        '* * * * *',
        taskFunction
      )

      expect(result).toBe(false)
      expect(scheduler.tasks.size).toBe(1)
    })

    test('should reject invalid cron expressions', () => {
      const scheduler = getSchedulerService()
      const cronAny = /** @type {any} */ (cron)
      cronAny.validate.mockReturnValue(false)

      const taskFunction = jest.fn()
      const result = scheduler.scheduleTask(
        'invalid-cron',
        'invalid',
        taskFunction
      )

      expect(result).toBe(false)
      expect(scheduler.tasks.has('invalid-cron')).toBe(false)
    })

    test('should run task immediately when runImmediately is true', () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest.fn().mockImplementation(() => Promise.resolve())
      scheduler.scheduleTask('immediate-task', '* * * * *', taskFunction, true)

      jest.runAllTimers()

      const taskData = scheduler.tasks.get('immediate-task')
      expect(taskData).toBeDefined()
      expect(taskData.taskFunction).toBeDefined()
      expect(taskFunction).toHaveBeenCalled()
    })

    test('should not run task immediately when runImmediately is false', () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest.fn().mockImplementation(() => Promise.resolve())
      scheduler.scheduleTask('immediate-task', '* * * * *', taskFunction, false)

      jest.runAllTimers()

      const taskData = scheduler.tasks.get('immediate-task')
      expect(taskData).toBeDefined()
      expect(taskData.taskFunction).toBeDefined()
      expect(taskFunction).not.toHaveBeenCalled()
    })

    test('should handle task execution errors', async () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest
        .fn()
        .mockImplementation(() => Promise.reject(new Error('Task error')))
      // First run - run immediately is true
      scheduler.scheduleTask('error-task', '* * * * *', taskFunction, true)

      jest.runAllTimers()

      const taskData = scheduler.tasks.get('error-task')
      expect(taskData).toBeDefined()

      // Second run.
      await taskData.taskFunction()

      expect(taskFunction).toHaveBeenCalledTimes(2)
    })

    test('should handle task execution with non-Error objects', async () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest.fn().mockImplementation(() => {
        // Testing scheduler handles non-Error rejection values
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject('String error')
      })
      // First run - run immediately is true
      scheduler.scheduleTask(
        'string-error-task',
        '* * * * *',
        taskFunction,
        true
      )

      jest.runAllTimers()

      const taskData = scheduler.tasks.get('string-error-task')
      expect(taskData).toBeDefined()

      // Second run.
      await taskData.taskFunction()

      expect(taskFunction).toHaveBeenCalledTimes(2)
    })

    test('should handle task execution with statusCode error', async () => {
      const scheduler = getSchedulerService()
      const error = new Error('HTTP Error')
      Object.assign(error, { statusCode: 404 })
      const taskFunction = jest
        .fn()
        .mockImplementation(() => Promise.reject(error))
      scheduler.scheduleTask('http-error-task', '* * * * *', taskFunction)

      const taskData = scheduler.tasks.get('http-error-task')
      expect(taskData).toBeDefined()

      await taskData.taskFunction()

      expect(taskFunction).toHaveBeenCalled()
    })

    test('should handle schedule creation errors', () => {
      const scheduler = getSchedulerService()
      const cronAny = /** @type {any} */ (cron)
      cronAny.createTask.mockImplementation(() => {
        throw new Error('Schedule creation failed')
      })

      const taskFunction = jest.fn()
      const result = scheduler.scheduleTask(
        'failed-schedule',
        '* * * * *',
        taskFunction
      )

      expect(result).toBe(false)
      expect(scheduler.tasks.has('failed-schedule')).toBe(false)
    })

    test('should handle immediate task execution errors', () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest
        .fn()
        .mockImplementation(() => Promise.reject(new Error('Immediate error')))
      scheduler.scheduleTask('immediate-error', '* * * * *', taskFunction, true)

      jest.runAllTimers()

      const taskData = scheduler.tasks.get('immediate-error')
      expect(taskData).toBeDefined()
    })
  })

  describe('start', () => {
    test('should start all scheduled tasks', () => {
      const scheduler = getSchedulerService()
      const taskFunction1 = jest.fn()
      const taskFunction2 = jest.fn()

      scheduler.scheduleTask('task1', '* * * * *', taskFunction1)
      scheduler.scheduleTask('task2', '*/5 * * * *', taskFunction2)

      scheduler.start()

      expect(scheduler.isInitialized).toBe(true)

      const task1Data = scheduler.tasks.get('task1')
      const task2Data = scheduler.tasks.get('task2')
      expect(task1Data.isRunning).toBe(true)
      expect(task2Data.isRunning).toBe(true)
      expect(task1Data.task.start).toHaveBeenCalled()
      expect(task2Data.task.start).toHaveBeenCalled()
    })

    test('should not start if already initialized', () => {
      const scheduler = getSchedulerService()
      scheduler.isInitialized = true

      const taskFunction = jest.fn()
      scheduler.scheduleTask('test-task', '* * * * *', taskFunction)
      const taskData = scheduler.tasks.get('test-task')

      scheduler.start()

      expect(taskData.task.start).not.toHaveBeenCalled()
    })

    test('should handle task start errors', () => {
      const scheduler = getSchedulerService()
      const mockTask = createMockTask()
      mockTask.start.mockImplementation(() => {
        throw new Error('Start failed')
      })
      const cronAny = /** @type {any} */ (cron)
      cronAny.createTask.mockReturnValue(mockTask)

      const taskFunction = jest.fn()
      scheduler.scheduleTask('failed-start', '* * * * *', taskFunction)

      scheduler.start()

      expect(scheduler.isInitialized).toBe(true)
    })
  })

  describe('stop', () => {
    test('should stop all scheduled tasks', () => {
      const scheduler = getSchedulerService()
      const taskFunction1 = jest.fn()
      const taskFunction2 = jest.fn()

      scheduler.scheduleTask('task1', '* * * * *', taskFunction1)
      scheduler.scheduleTask('task2', '*/5 * * * *', taskFunction2)
      scheduler.start()

      scheduler.stop()

      expect(scheduler.isInitialized).toBe(false)

      const task1Data = scheduler.tasks.get('task1')
      const task2Data = scheduler.tasks.get('task2')
      expect(task1Data.isRunning).toBe(false)
      expect(task2Data.isRunning).toBe(false)
      expect(task1Data.task.stop).toHaveBeenCalledTimes(1)
      expect(task2Data.task.stop).toHaveBeenCalledTimes(1)
    })

    test('should not stop if not initialized', () => {
      const scheduler = getSchedulerService()
      scheduler.isInitialized = false

      const taskFunction = jest.fn()
      scheduler.scheduleTask('test-task', '* * * * *', taskFunction)
      const taskData = scheduler.tasks.get('test-task')

      taskData.task.stop.mockClear()
      scheduler.stop()

      expect(taskData.task.stop).not.toHaveBeenCalled()
    })

    test('should handle task stop errors', () => {
      const scheduler = getSchedulerService()
      const mockTask = createMockTask()
      mockTask.stop.mockImplementation(() => {
        throw new Error('Stop failed')
      })
      const cronAny = /** @type {any} */ (cron)
      cronAny.createTask.mockReturnValue(mockTask)

      const taskFunction = jest.fn()
      scheduler.scheduleTask('failed-stop', '* * * * *', taskFunction)
      scheduler.start()

      scheduler.stop()

      expect(scheduler.isInitialized).toBe(false)
    })
  })

  describe('triggerTask', () => {
    test('should trigger a task manually', async () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest.fn().mockImplementation(() => Promise.resolve())
      scheduler.scheduleTask('manual-task', '* * * * *', taskFunction)

      const result = await scheduler.triggerTask('manual-task')

      expect(result).toBe(true)
      expect(taskFunction).toHaveBeenCalledTimes(1)
    })

    test('should return false for non-existent task', async () => {
      const scheduler = getSchedulerService()
      const result = await scheduler.triggerTask('non-existent')

      expect(result).toBe(false)
    })

    test('should handle task trigger errors', async () => {
      const scheduler = getSchedulerService()
      const taskFunction = jest
        .fn()
        .mockImplementation(() => Promise.reject(new Error('Trigger error')))
      scheduler.scheduleTask('trigger-error', '* * * * *', taskFunction)

      const result = await scheduler.triggerTask('trigger-error')

      expect(result).toBe(true)
      expect(taskFunction).toHaveBeenCalledTimes(1)
    })
  })

  describe('getSchedulerService', () => {
    test('should return singleton instance', () => {
      const instance1 = getSchedulerService()
      const instance2 = getSchedulerService()

      expect(instance1).toBe(instance2)
    })
  })

  describe('initialiseEmailExpiringSoonScheduler', () => {
    test('should initialise scheduler when enabled', () => {
      const result = initialiseEmailExpiringSoonScheduler('test-runtime-id')

      expect(result).toBeDefined()
      expect(config.get).toHaveBeenCalledWith(
        'emailUsersExpiringSoonSavedForLaterLink.enabled'
      )
      expect(config.get).toHaveBeenCalledWith(
        'emailUsersExpiringSoonSavedForLaterLink.cronSchedule'
      )

      const scheduler = getSchedulerService()
      expect(
        scheduler.tasks.has('email-users-expiring-soon-saved-for-later-link')
      ).toBe(true)
    })

    test('should not initialise when disabled', () => {
      const configAny = /** @type {any} */ (config)
      configAny.get.mockImplementation((/** @type {any} */ key) => {
        if (key === 'emailUsersExpiringSoonSavedForLaterLink.enabled') {
          return false
        }
        if (key === 'emailUsersExpiringSoonSavedForLaterLink.cronSchedule') {
          return '0 9-20 * * *'
        }
        return undefined
      })

      const result = initialiseEmailExpiringSoonScheduler('test-runtime-id')

      expect(result).toBeNull()
    })

    test('should throw error when scheduling fails', () => {
      const cronAny = /** @type {any} */ (cron)
      cronAny.validate.mockReturnValue(false)

      expect(() =>
        initialiseEmailExpiringSoonScheduler('test-runtime-id')
      ).toThrow('Failed to initialize email expiring soon scheduler')
    })
  })
})
