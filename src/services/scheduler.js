import { getErrorMessage } from '@defra/forms-model'
import cron from 'node-cron'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { processExpiringSaveAndExitRecords } from '~/src/services/expiring-save-and-exit.js'

const logger = createLogger()

/**
 * Scheduler service for managing periodic tasks
 */
class SchedulerService {
  /**
   * Create scheduler service instance
   */
  constructor() {
    this.tasks = new Map()
    this.isInitialized = false
  }

  /**
   * Schedule a recurring task
   * @param {string} name - Unique name for the task
   * @param {string} cronExpression - Cron expression for scheduling
   * @param {Function} taskFunction - Function to execute
   * @param {boolean} runImmediately - Whether to run the task immediately on startup
   * @returns {boolean} True if task was scheduled successfully
   */
  scheduleTask(name, cronExpression, taskFunction, runImmediately = false) {
    try {
      if (this.tasks.has(name)) {
        logger.warn(
          `[SchedulerService] Task '${name}' already exists, skipping`
        )
        return false
      }

      if (!cron.validate(cronExpression)) {
        logger.error(
          `[SchedulerService] Invalid cron expression for task '${name}': ${cronExpression}`
        )
        return false
      }

      const executeScheduledTask = async () => {
        try {
          await taskFunction()
        } catch (err) {
          logger.error(
            err,
            `[SchedulerService] Task '${name}' failed: ${getErrorMessage(err)}`
          )
        }
      }

      const task = cron.createTask(cronExpression, executeScheduledTask, {
        timezone: 'UTC'
      })

      this.tasks.set(name, {
        task,
        cronExpression,
        taskFunction: executeScheduledTask,
        isRunning: false
      })

      if (runImmediately) {
        setImmediate(() => {
          executeScheduledTask().catch((/** @type {unknown} */ err) => {
            logger.error(
              err,
              `[SchedulerService] Immediate task execution failed: ${getErrorMessage(err)}`
            )
          })
        })
      }

      return true
    } catch (err) {
      logger.error(
        err,
        `[SchedulerService] Failed to schedule task '${name}': ${getErrorMessage(err)}`
      )
      return false
    }
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    if (this.isInitialized) {
      logger.warn('[SchedulerService] Scheduler already started')
      return
    }

    logger.info(
      `[SchedulerService] Starting scheduler with ${this.tasks.size} tasks`
    )

    for (const [name, taskData] of this.tasks) {
      try {
        taskData.task.start()
        taskData.isRunning = true
      } catch (err) {
        logger.error(
          err,
          `[SchedulerService] Failed to start task '${name}': ${getErrorMessage(err)}`
        )
      }
    }

    this.isInitialized = true
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    if (!this.isInitialized) {
      logger.warn('[SchedulerService] Scheduler not running')
      return
    }

    logger.info(
      `[SchedulerService] Stopping scheduler with ${this.tasks.size} tasks`
    )

    for (const [name, taskData] of this.tasks) {
      try {
        taskData.task.stop()
        taskData.isRunning = false
      } catch (err) {
        logger.error(
          err,
          `[SchedulerService] Failed to stop task '${name}': ${getErrorMessage(err)}`
        )
      }
    }

    this.isInitialized = false
  }

  /**
   * Manually trigger a task
   * @param {string} name - Name of the task to trigger
   * @returns {Promise<boolean>} True if task was triggered successfully
   */
  async triggerTask(name) {
    const taskData = this.tasks.get(name)
    if (!taskData) {
      logger.error(`[SchedulerService] Task '${name}' not found`)
      return false
    }

    try {
      await taskData.taskFunction()
      return true
    } catch (err) {
      logger.error(
        err,
        `[SchedulerService] Failed to trigger task '${name}': ${getErrorMessage(err)}`
      )
      return false
    }
  }
}

let schedulerService = null

/**
 * Get the scheduler service instance
 * @returns {SchedulerService} The scheduler service instance
 */
export function getSchedulerService() {
  schedulerService ??= new SchedulerService()
  return schedulerService
}

/**
 * Initialise and configure the email expiring soon scheduler
 * @param {string} runtimeId - The global runtime ID
 * @returns {SchedulerService|null} The scheduler service instance or null if disabled
 */
export function initialiseEmailExpiringSoonScheduler(runtimeId) {
  const scheduler = getSchedulerService()

  const enabled = config.get('emailUsersExpiringSoonSavedForLaterLink.enabled')
  const cronSchedule = config.get(
    'emailUsersExpiringSoonSavedForLaterLink.cronSchedule'
  )
  const expiryWindowInHours = config.get(
    'emailUsersExpiringSoonSavedForLaterLink.expiryWindowInHours'
  )

  if (!enabled) {
    return null
  }

  const success = scheduler.scheduleTask(
    'email-users-expiring-soon-saved-for-later-link',
    cronSchedule,
    async () => {
      await processExpiringSaveAndExitRecords(runtimeId, expiryWindowInHours)
    },
    false
  )

  if (!success) {
    logger.error(
      '[SchedulerService] Failed to schedule email expiring soon task'
    )
    throw new Error('Failed to initialize email expiring soon scheduler')
  }

  return scheduler
}
