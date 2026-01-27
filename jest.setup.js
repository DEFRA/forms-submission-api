import nock from 'nock'

process.env.NOTIFY_API_KEY = 'dummy'
process.env.NOTIFY_TEMPLATE_ID = 'dummy'
process.env.NOTIFY_REPLY_TO_ID = 'dummy'
process.env.MANAGER_URL = 'http://localhost:3009'
process.env.DESIGNER_URL = 'http://localhost:3000'

process.env.OIDC_JWKS_URI = 'https://oidc.com/.well_known/jwks.json'
process.env.OIDC_VERIFY_AUD = 'dummy'
process.env.OIDC_VERIFY_ISS = 'dummy'
process.env.COGNITO_JWKS_URI = 'https://cognito.com/.well_known/jwks.json'
process.env.COGNITO_CLIENT_IDS = '["dummy"]'
process.env.COGNITO_VERIFY_ISS = 'dummy'

// Sample JWKS response for @hapi/jwt
const jwks = {
  keys: [
    {
      alg: 'RS256',
      e: 'AQAB',
      kid: '9tuAErwpIu41FajLxmC9+8Y7kMXa0kO3sY=',
      kty: 'RSA',
      n: 'q3DaFfvNA0C8wOaVsx-P68LqF4U5NzQuz9',
      use: 'sig'
    },
    {
      alg: 'RS256',
      e: 'AQAB',
      kid: 'amhKOdpcPs5+U9IPbk+wt4BDZbqAJBcRYLo=',
      kty: 'RSA',
      n: 'rcc6oqD-v3GRyhW7z0qgCoW7FYEtMifFkLwQmtFQRG',
      use: 'sig'
    }
  ]
}

nock('https://oidc.com')
  .persist()
  .get('/.well_known/jwks.json')
  .reply(200, jwks)

nock('https://cognito.com')
  .persist()
  .get('/.well_known/jwks.json')
  .reply(200, jwks)
