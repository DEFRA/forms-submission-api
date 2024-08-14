# Retrieving a file

Files are retrieved by generating a file access link, which can be shared with users to download the file. In practice this
is a presigned link to the object in S3, but the ultimate destination shouldn't impact how the link is used - a user just
needs to load it in a web browser. This has a key advantage in that we're not loading large files into memory, we're just
facilitating the sharing of a public link which can be accessed by anybody (internal staff, citizen, etc).

Files can only be accessed with a matching retrievalKey, which was the key at the time of `POST /files/persist` being called.

```
POST /file/link
{
  "fileId": "123-456-789",
  "retrievalKey": "secret value here"
}
```

Returns:

```
{
  "url": "https://demo.amazonaws.com/123-456-789.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAJJWZ7B6WCRGMKFGQ%2F20180210%2Feu-west-2%2Fs3%2Faws4_request&X-Amz-Date=20180210T171315Z&X-Amz-Expires=1800&X-Amz-Signature=12b74b0788aa036bc7c3d03b3f20c61f1f91cc9ad8873e3314255dc479a25351&X-Amz-SignedHeaders=host"
}
```

The above URL is then shared with a user. An example approach is below, but ultimately this is an idea and the end approach is up to the client.

```javascript
// example route handler in forms-designer
{
  path: "/download",
  handler: (request) => {
    const { fileId, retrievalKey } = something // from `request.payload`, `request.yar`, etc.

    const { url } = formsSubmissionApi.createLink(fileId, submissionId)

    return h.view('view', { url })
  }
}
```

```html
<a href="{{ url }}" download>Download file</a>
```

## Handling expired files

In the event a file has expired in S3 and link generation is attempted, the API will throw a 410 Gone error which can be
handled by the frontend by showing an appropriate error message (e.g. link has expired, file doesn't exist, etc.)
