import admin from '~/src/routes/admin.js'
import files from '~/src/routes/files.js'
import form from '~/src/routes/form.js'
import health from '~/src/routes/health.js'
import submission from '~/src/routes/submission.js'

export default [health, files, form, submission, admin].flat()
