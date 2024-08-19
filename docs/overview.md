# Solution overview

This service keeps track of files uploaded during the citizen journey of forms-runner via the cdp-uploader.

See https://dev.azure.com/defragovuk/DEFRA-CDP/_wiki/wikis/Digital%20Forms%20Accelerator.Wiki/26636/File-upload-feature.

## Expected usage

forms-runner

1. A call to `POST /file` is made via cdp-uploader to ingest the file into the database.
2. After some time, the user submits the form. A call to `/files/persist` is made to extend the expiry time.
3. A download link is sent to the internal user, but this link is NOT the result of `POST /file/link` but a permanent
   download page in forms-designer that allows the user to input the retrieval key.

forms-designer

4. Upon the download link being accessed in forms-designer, forms-designer makes makes a call to `POST /file/link`
   which creates a short lived access link, which is then shared with the user.

Uploaded files may not eventually be submitted if the user abandons the form submission, therefore steps 2-4 are optional
and the files will naturally expire according to the S3 policies.
