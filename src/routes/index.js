import files from '~/src/routes/files.js'
import form from '~/src/routes/form.js'
import health from '~/src/routes/health.js'
import testError from '~/src/routes/test-error.js'

export default [health, files, form, testError].flat()
