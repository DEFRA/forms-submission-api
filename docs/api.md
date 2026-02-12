# Forms Submission API - External Access

This document describes how external services can authenticate with and call the Forms Submission API using AWS Cognito.

## Available Endpoints

> **Note:** All endpoints are accessible only from whitelisted IP addresses. Contact the Defra Forms team to request access for your service.

The following endpoints are available to external services using Cognito authentication:

| Method | Path         | Description                                     |
| ------ | ------------ | ----------------------------------------------- |
| POST   | `/file/link` | Retrieve a pre-signed URL for accessing a file. |

### POST /file/link

Retrieves a pre-signed URL for accessing an uploaded file.

**Request Body:**

```json
{
  "fileId": "string",
  "retrievalKey": "string"
}
```

**Response:**

```json
{
  "url": "string"
}
```

The returned URL is a time-limited pre-signed URL that allows direct access to the file.

## API Base URL

```
https://forms-submission-api.api.<environment>.cdp.defra.gov.uk
```

Replace `<environment>` with the target environment: `dev`, `test`, `ext-test`, or `prod`.

## Obtaining Credentials

To access the API, you will need a **client ID** and **client secret**. These are issued manually by the Defra Forms team.

To request credentials:

1. Contact the Defra Forms team.
2. Provide details of your service and the intended use case.
3. The team will issue you a client ID and client secret.

These credentials are used to programmatically obtain a short-lived access token from AWS Cognito.

## Authentication

### Obtaining an Access Token

Exchange your client ID and secret for an access token by making a request to the Cognito token endpoint.

For the Cognito token URL for each environment, refer to the CDP documentation:
https://portal.cdp-int.defra.cloud/documentation/how-to/apis.md#what-are-the-login-urls-for-my-api-

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

### Making an Authenticated Request

Include the access token in the `Authorization` header as a Bearer token.

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

## Full Example

The following example demonstrates the complete workflow: obtaining an access token, calling the API, and downloading a file.

```javascript
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

async function downloadFile(presignedUrl, outputPath) {
  const res = await fetch(presignedUrl, {
    headers: { 'Accept-Encoding': 'identity' }
  })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  await pipeline(res.body, createWriteStream(outputPath))
}

async function main() {
  const clientId = process.env.COGNITO_CLIENT_ID
  const clientSecret = process.env.COGNITO_CLIENT_SECRET
  const tokenUrl = process.env.COGNITO_TOKEN_URL
  const apiBaseUrl = process.env.API_BASE_URL

  // Obtain access token
  const accessToken = await getCognitoToken(clientId, clientSecret, tokenUrl)

  // Call the API
  const result = await getFileLink(
    apiBaseUrl,
    accessToken,
    'your-file-id',
    'your-retrieval-key'
  )

  console.log('Pre-signed URL:', result.url)

  // Download and save the file
  await downloadFile(result.url, './downloaded-file.pdf')
}

main()
```
