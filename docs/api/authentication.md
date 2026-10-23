# Forms Submission API - Authentication

This document describes how external services get an access token from AWS Cognito and use it to call the Forms Submission API. For the URLs in each environment, see [Environments](./README.md#environments).

The authentication process is a standard OAuth 2.0 Client Credentials flow. The below code snippets are provided as reference only, they do not described a bespoke process - any OAuth 2.0 compatible code or libraries will work.

## Obtaining an Access Token

Exchange your client ID and secret for an access token by making a request to the [Cognito token endpoint](./README.md#cognito-token-endpoint) for your environment.

The examples below add `/oauth2/token` to `tokenUrl`, so set `tokenUrl` to the endpoint without that path.

```javascript
async function getCognitoToken(clientId, clientSecret, tokenUrl) {
  const clientCredentials = `${clientId}:${clientSecret}`
  const encodedCredentials = Buffer.from(clientCredentials).toString('base64')

  const headers = {
    Authorization: `Basic ${encodedCredentials}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials'
  })

  const response = await fetch(`${tokenUrl}/oauth2/token`, {
    method: 'POST',
    headers,
    body
  })

  if (!response.ok) {
    throw new Error(`Failed to obtain token: ${response.statusText}`)
  }

  const tokenResponse = await response.json()
  return tokenResponse.access_token
}
```

## Making an Authenticated Request

Send requests to the [API base URL](./README.md#api-base-url) for your environment. Include the access token in the `Authorization` header as a Bearer token.

```javascript
async function getFileLink(apiBaseUrl, accessToken, fileId, retrievalKey) {
  const response = await fetch(`${apiBaseUrl}/file/link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity'
    },
    body: JSON.stringify({
      fileId,
      retrievalKey
    })
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`)
  }

  return response.json()
}
```
