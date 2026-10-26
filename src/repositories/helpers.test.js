import { FormStatus } from '@defra/forms-model'

import { previewFilter } from '~/src/repositories/helpers.js'

describe('repository helpers', () => {
  describe('previewFilter', () => {
    it('should exclude previews for a live form', () => {
      expect(previewFilter(undefined)).toEqual({
        'form.isPreview': { $ne: true }
      })
    })

    it('should match draft previews', () => {
      expect(previewFilter(FormStatus.Draft)).toEqual({
        'form.isPreview': true,
        'form.status': FormStatus.Draft
      })
    })

    it('should match live previews', () => {
      expect(previewFilter(FormStatus.Live)).toEqual({
        'form.isPreview': true,
        'form.status': FormStatus.Live
      })
    })
  })
})
