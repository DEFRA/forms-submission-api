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

## Migration Solution

A database migration has been implemented using migrate-mongo to properly move documents from `file-upload-status` to `files` collection:

### Migration Process

1. The migration script (`migrations/20250701153637-move-file-upload-status-to-files.cjs`) copies all documents from `file-upload-status` to `files`
2. Skips any documents that already exist in `files` (based on fileId)
3. Logs detailed progress and summary
4. Preserves the original collection

### Running Migrations

- **Automatic**: Migrations run automatically on container startup via `scripts/run-migrations-and-start.sh`
- **Manual**: Use `npm run migrate:up` to run migrations manually
- **Status**: Use `npm run migrate:status` to check migration status
- **Rollback**: Use `npm run migrate:down` to rollback if needed

## Next Steps

Once the migration has been successfully run in all environments:

1. Verify all documents have been copied correctly
2. Remove the fallback logic from `src/api/files/repository.js`
3. Ensure all services are writing to the correct `files` collection
4. After sufficient time, the `file-upload-status` collection can be archived or removed
