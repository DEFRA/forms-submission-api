/**
 * The filter for the preview state of a record. A live form and a preview of
 * the live form both have the status `live`, thus the filter uses the two
 * fields.
 * A live record can have no `isPreview` field, thus the filter uses `$ne`.
 * @param {FormStatus} [preview] - the preview state, or none for a live form
 * @param {string} [parentKey] - the parent key for the form fields, defaults to 'form'
 */
export function previewFilter(preview, parentKey = 'form') {
  return preview
    ? { [`${parentKey}.isPreview`]: true, [`${parentKey}.status`]: preview }
    : { [`${parentKey}.isPreview`]: { $ne: true } }
}

/**
 * @import { FormStatus } from '@defra/forms-model'
 */
