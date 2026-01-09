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

