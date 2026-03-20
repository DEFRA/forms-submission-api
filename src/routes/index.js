import admin from '~/src/routes/admin.js'
import files from '~/src/routes/files.js'
import form from '~/src/routes/form.js'
import health from '~/src/routes/health.js'

export default [health, files, form, admin].flat()
