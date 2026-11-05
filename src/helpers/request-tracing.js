import {
  applyLogContextHeaders as applyLogContextHeader,
  applyTraceHeaders as applyTraceHeader,
  requestTracing as requestTracingPlugin
} from '@defra/forms-common'
import { tracing } from '@defra/hapi-tracing'

import { config } from '~/src/config/index.js'

const tracingHeader = config.get('tracing.header')

/**
 * Adds the correlation ID of the current log context to the headers of an
 * outbound HTTP request, so the receiving service logs the same ID
 * @template {Record<string, any>} Headers
 * @param {Headers} [headers] - the existing headers
 * @returns {Headers | undefined}
 */
export function applyTraceHeaders(headers) {
  return applyTraceHeader(headers, tracingHeader)
}

/**
 * The origins of the forms services the API calls. The session ID and form
 * reference number are only sent to these, never to a service outside forms,
 * such as GOV.UK Notify.
 * @type {Set<string>}
 */
const formsServiceOrigins = new Set(
  [config.get('entitlementUrl'), config.get('managerUrl')]
    .filter(
      /** @returns {serviceUrl is string} */
      (serviceUrl) => typeof serviceUrl === 'string' && URL.canParse(serviceUrl)
    )
    .map((serviceUrl) => new URL(serviceUrl).origin)
)

/**
 * Adds the session ID and form reference number of the current log context to
 * the headers of an outbound HTTP request, when the request is to another
 * forms service. They are never sent to a service outside forms, such as
 * GOV.UK Notify.
 * @template {Record<string, any>} Headers
 * @param {URL} url - the URL of the request
 * @param {Headers} [headers] - the existing headers
 * @returns {Headers | undefined}
 */
export function applyLogContextHeaders(url, headers) {
  if (!formsServiceOrigins.has(url.origin)) {
    return headers
  }

  return applyLogContextHeader(headers)
}

/**
 * Gets the unique ID of the authenticated user, which is the `oid` of a
 * staff user or the `sub` of a citizen
 * @param {Request} request
 * @returns {string | undefined}
 */
export function getRequestUserId(request) {
  const { credentials, isAuthenticated } = request.auth

  if (!isAuthenticated) {
    return undefined
  }

  return credentials.user?.oid ?? credentials.user?.sub
}

/**
 * Starts a log context for every request, holding the correlation ID from the
 * tracing header (or a new ID when the caller sent none), the ID of the
 * authenticated user, and the session ID and form reference number sent by
 * the calling forms service. The logger writes them on every log line.
 * @satisfies {ServerRegisterPluginObject<RequestTracingOptions>}
 */
export const requestTracing = {
  plugin: requestTracingPlugin,
  options: {
    tracingHeader,
    tracingPlugin: tracing.plugin,
    getUserId: getRequestUserId,
    readLogContextHeaders: true
  }
}

/**
 * @import { RequestTracingOptions } from '@defra/forms-common'
 * @import { Request, ServerRegisterPluginObject } from '@hapi/hapi'
 */
