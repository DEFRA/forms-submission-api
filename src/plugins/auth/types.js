/**
 * @import { HapiJwt } from '@hapi/jwt'
 * @import { IdTokenClaims } from 'oidc-client-ts'
 */

/**
 * @template {object} Payload
 * @typedef {HapiJwt.Artifacts<{ JwtPayload?: Payload }>} Artifacts
 */

/**
 * The claims this service reads from a citizen access token. The provider
 * signs more than these.
 * @typedef {object} CitizenAccessTokenPayload
 * @property {string} sub - the citizen's identifier at their provider
 * @property {string} iss - the provider that authenticated the citizen
 */
