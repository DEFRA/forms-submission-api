# Temporary Collection Fallback Fix

## Problem

File metadata is currently split between two collections in our dev, test and production databases:

- `files` - the correct collection, storing all our file metadata to date
- `file-upload-status` - the incorrect collection, storing file metadata for a ~3 hour window from yesterday

This results in some files displaying 404 errors because the metadata is in the wrong collection, when we should return a 410 (Gone) status if a file can't be found.

## Temporary Solution

As a temporary measure, we've modified the forms-submission-api to support retrieval from both collections:

1. The API first attempts to retrieve file metadata from the `files` collection
2. If not found, it falls back to checking the `file-upload-status` collection
3. Only if the file is not found in either collection will a 404 be returned

### Affected Endpoints

- `GET /file/{fileId}` - Check file status
- `POST /file/link` - Get presigned link for file download

### Implementation Details

The fallback logic has been implemented in `src/api/files/repository.js` in the `getByFileId` function:

```javascript
export async function getByFileId(fileId) {
  // First try the correct collection
  const filesColl = db.collection(COLLECTION_NAME)
  let value = await filesColl.findOne({ fileId })

  // If not found in the correct collection, try the incorrect collection
  if (!value) {
    const fallbackColl = db.collection('file-upload-status')
    value = await fallbackColl.findOne({ fileId })
  }

  return value
}
```

## Next Steps

This is a temporary fix to resolve the immediate 404 errors. A proper solution should include:

1. Data migration to move all documents from `file-upload-status` to `files` collection
2. Removal of the fallback logic once migration is complete
3. Ensuring all services write to the correct collection
