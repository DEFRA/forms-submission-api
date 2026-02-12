import { getErrorMessage } from '@defra/forms-model'

import { initialiseEmailExpiringSoonScheduler } from '~/src/services/scheduler.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const scheduler = {
  plugin: {
    name: 'scheduler',
    version: '1.0.0',
    register(server) {
      try {
        const runtimeId = server.app.runtimeId

        if (!runtimeId) {
          throw new Error('Runtime ID not found in server application state')
        }

        const schedulerService = initialiseEmailExpiringSoonScheduler(runtimeId)

        if (schedulerService) {
          schedulerService.start()

          server.app.scheduler = schedulerService

          server.events.on('stop', () => {
            server.logger.info(
              '[SchedulerPlugin] Stopping scheduler due to server shutdown'
            )
            schedulerService.stop()
          })
        } else {
          server.logger.info(
            '[SchedulerPlugin] Scheduler disabled via configuration'
          )

          server.app.scheduler = null
        }
      } catch (err) {
        server.logger.error(
          err,
          `[SchedulerPlugin] Failed to initialize scheduler: ${getErrorMessage(err)}`
        )
        throw err
      }
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
