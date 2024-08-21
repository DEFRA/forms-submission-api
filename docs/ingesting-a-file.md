# Ingesting a file

Users in the forms-runner are offered the opportunity to upload a file. When they do this, the form they upload the files into
has a form action of cdp-uploader (`<form action="cdp-uploader/upload">`). Once CDP virus scan the files, cdp-uploader makes a
callback to our forms-submission-api's `POST /file` endpoint to indicate success, before redirecting the user back to the
forms-runner form journey. As part of this callback, CDP tells us details about the file (see `src/api/types.js`, type
`UploadPayload` for the type definition), such as:

- File name
- File type
- Path to the file in S3

The above properties are contained in the callback's request payload. We also inject a "retrieval key" inside the payload's `metadata`
property. This key is then used to access the file after ingestion (e.g. for retrieval). This `retrievalKey` property is defined
by the initiator (forms-runner) but sent to us by the cdp-uploader. As of writing this documentation, the `retrievalKey` is the
submission output email address at the time of file upload. Without this key, a file cannot be accessed or modified again.

Upon ingestion, we create a record in the database so that the file can be tracked. As part of this ingestion, we securely hash
and store the retrievalKey using argon2id.

## File expiry

Defra Forms does not provide long term storage. We provide short term storage and access to files, but the expectation is that
downstream systems will store the form submission (and associated files) for the long term. We provide up to 30 days storage only.

File expiry is handled by AWS S3 through lifecycle configuration policies based on the file path prefix. Uploaded files last
for 7 days by default (when uploaded by a user), however they can be extended to 30 days if a user submits the form and sends the data to Defra.

For more information, see:

- [S3 documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)
- [S3 configuration](https://github.com/DEFRA/cdp-tf-svc-infra/blob/307bc350ab1baf5cd8ad9d2cdaaf9693cd9610de/environments/prod/resources/s3_bucket_names.json#L33)

cdp-uploader will upload the files with a prefix of `staging/`, which per the above link has a 7 day expiry. Upon form submission,
all files within the form submission need to be accessible for 30 days. `forms-runner` would then call the `POST /files/persist`
with each file to load it into the `/loaded` directory which has a 30 day expiry on it.

## Persisting a file for 30 days

In addition to `POST /files/persist` moving files into the prefix with a 30 day expiry, the endpoint takes an updated retrieval
key as this value may have been updated between the form's file upload and form submission.

`/files/persist` is designed to be called on form submission, so it can take a batch of files to update in one transaction. For example:

```json
{
  "files": [
    {
      "fileId": "9fcaabe5-77ec-44db-8356-3a6e8dc51b18",
      "initiatedRetrievalKey": "the-retrieval-key-for-this-file"
    },
    {
      "fileId": "9fcaabe5-77ec-44db-8356-3a6e8dc51b19",
      "initiatedRetrievalKey": "perhaps-a-different-retrieval-key"
    }
  ],
  "persistedRetrievalKey": "a-new-key-applied-to-all-files-in-the-batch"
}
```
