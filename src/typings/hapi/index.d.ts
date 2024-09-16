import { UserCredentials } from '@hapi/hapi'

declare module '@hapi/hapi' {
  interface UserCredentials {
    /**
     * Object ID of the user
     */
    oid?: string

    /**
     * Groups of the user
     */
    groups?: string[]
  }
}
