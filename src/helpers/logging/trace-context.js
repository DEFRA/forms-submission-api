import { AsyncLocalStorage } from 'node:async_hooks'

import { getTraceId } from '@defra/hapi-tracing'

import { config } from '~/src/config/index.js'

const tracingHeader = config.get('tracing.header')

/**
 * Holds the trace id of work that is not an HTTP request, such as a queue
 * message. `@defra/hapi-tracing` only sets a trace id during a request, so
 * without this the logs of a queue consumer carry no trace id.
 * @type {AsyncLocalStorage<string>}
 */
const storage = new AsyncLocalStorage()

/**
 * Runs `fn` with `traceId` as the current trace id, so every log written and
 * every internal call made while it runs carries that id.
 * @template T
 * @param {string} traceId
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithTraceId(traceId, fn) {
  return storage.run(traceId, fn)
}

/**
 * The trace id of the current HTTP request, or else of the current queue
 * message, or undefined when there is neither
 * @returns {string | undefined}
 */
export function getCurrentTraceId() {
  return getTraceId() ?? storage.getStore()
}

/**
 * Headers that pass the current trace id on to another service. Use only for
 * calls to our own services, not to third parties such as GOV.UK Notify.
 * @returns {Record<string, string>}
 */
export function traceHeaders() {
  const traceId = getCurrentTraceId()

  // The header name is optional config: without it, send nothing rather
  // than a header literally named "null"
  return traceId && tracingHeader ? { [tracingHeader]: traceId } : {}
}
