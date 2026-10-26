/**
 * The filter for the preview state of a record. A live form and a preview of
 * the live form both have the status `live`, thus the filter uses the two
 * fields.
 * A live record can have no `isPreview` field, thus the filter uses `$ne`.
 * @param {FormStatus} [preview] - the preview state, or none for a live form
 */
export function previewFilter(preview) {
  return preview
    ? { 'form.isPreview': true, 'form.status': preview }
    : { 'form.isPreview': { $ne: true } }
}

/**
 * @import { FormStatus } from '@defra/forms-model'
 */
