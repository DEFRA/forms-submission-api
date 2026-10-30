declare module '@defra/hapi-tracing' {
  import { type Plugin } from '@hapi/hapi'

  export function getTraceId(): string | undefined

  export const tracing: {
    plugin: Plugin<{ tracingHeader?: string }>
  }
}
