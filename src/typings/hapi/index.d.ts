import { UserCredentials, ServerApplicationState } from '@hapi/hapi'

declare module '@hapi/hapi' {
  interface ServerApplicationState {
    /**
     * Global runtime ID for this service instance
     */
    runtimeId?: string

    /**
     * Scheduler service instance for managing cron jobs
     */
    scheduler?: {
      start(): void
      stop(): void
      scheduleTask(
        name: string,
        cronExpression: string,
        taskFunction: Function,
        runImmediately?: boolean
      ): boolean
      triggerTask(name: string): Promise<boolean>
    } | null
  }

  interface UserCredentials {
    /**
     * Object ID of the user
     */
    oid?: string

    /**
     * Subject of a citizen access token
     */
    sub?: string

    /**
     * Issuer of a citizen access token
     */
    iss?: string

    /**
     * Email of the account of a citizen access token, when the token has it
     */
    email?: string
  }

  interface AppCredentials {
    /**
     * The user pool client id
     */
    client_id?: string

    /**
     * Access token sub
     */
    sub?: string

    /**
     * Access token token_use
     */
    token_use?: string
  }
}

