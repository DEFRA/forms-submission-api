declare module '@defra/hapi-tracing' {
  export function getTraceId(): string | undefined

  export const tracing: {
    plugin: any
  }
}
