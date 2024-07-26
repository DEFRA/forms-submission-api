import { ProxyAgent, fetch as undiciFetch } from 'undici'

import { config } from '~/src/config/index.js'

/**
 * @param {Parameters<undiciFetch>[0]} url
 * @param {Parameters<undiciFetch>[1]} opts
 */
const nonProxyFetch = (url, opts) => {
  return undiciFetch(url, {
    ...opts
  })
}

/**
 * @param {Parameters<undiciFetch>[0]} url
 * @param {Parameters<undiciFetch>[1]} opts
 */
export const proxyFetch = (url, opts) => {
  const httpsProxy = config.get('httpsProxy')
  if (!httpsProxy) {
    return nonProxyFetch(url, opts)
  } else {
    return undiciFetch(url, {
      ...opts,
      dispatcher: new ProxyAgent({
        uri: httpsProxy,
        keepAliveTimeout: 10,
        keepAliveMaxTimeout: 10
      })
    })
  }
}
