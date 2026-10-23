# Forms Submission API - Full Example

This example demonstrates the complete workflow: obtaining an access token, calling the API, and downloading a file.

It uses the `getCognitoToken` and `getFileLink` functions from [Authentication](./authentication.md).

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
