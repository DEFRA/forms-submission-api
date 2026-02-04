import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import {
  ComponentType,
  hasRepeater,
  replaceCustomControllers
} from '@defra/forms-model'
import argon2 from 'argon2'
import xlsx from 'xlsx'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import {
  formatPaymentAmount,
  formatPaymentDate
} from '~/src/helpers/payment-helper.js'
import { getSubmissionRecords } from '~/src/repositories/submission-repository.js'
import {
  getFormDefinition,
  getFormDefinitionVersion,
  getFormMetadataById
} from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'
import { createSubmissionXlsxFile } from '~/src/services/service-helpers.js'

/**
 * @typedef {object} SpreadsheetOptions
 * @property {object} [filter] - query filter
 * @property {boolean} [includeFormName] - add FormName column to spreadsheet
 * @property {Set<string>} [removeColumns] - remove these columns from spreadsheet
 * @property {boolean} [isFeedbackForm] - true if this is a feedback form
 */

/**
 * @typedef { string | number | Date | undefined } CellValue
 */

/**
 * @typedef {object} Caches
 * @property {Map<number | undefined, FormModel>} models - cache for models
 * @property {Map<string, CellValue >[]} rows - cache for rows
 * @property {Map<string, Component>} components - cache for components
 * @property {Map<string, string>} headers - cache for headers
 * @property {Map<string, string>} formNames - cache for form names
 */

/**
 * @typedef {object} SpreadsheetContext
 * @property {Caches} caches - caches for the spreadsheet generation
 * @property {SpreadsheetOptions} [options] - options for the spreadsheet generation
 */

const logger = createLogger()

const designerUrl = config.get('designerUrl')
const notifyTemplateId = config.get('notifyTemplateId')
const notifyReplyToId = config.get('notifyReplyToId')

const SUBMISSION_STATUS_HEADER = 'Status'
const SUBMISSION_STATUS_HEADER_TEXT = 'Live or draft'

const SUBMISSION_ISPREVIEW_HEADER = 'isPreview'
const SUBMISSION_ISPREVIEW_HEADER_TEXT = 'Is preview'

const SUBMISSION_REF_HEADER = 'SubmissionRef'
const SUBMISSION_REF_HEADER_TEXT = 'Submission reference number'

const SUBMISSION_DATE_HEADER = 'SubmissionDate'
const SUBMISSION_DATE_HEADER_TEXT = 'Submission date'

const SUBMISSION_FORM_NAME = 'SubmissionFormName'
const SUBMISSION_FORM_NAME_TEXT = 'Form name'

const PAYMENT_DESCRIPTION_HEADER = 'PaymentDescription'
const PAYMENT_DESCRIPTION_HEADER_TEXT = 'Payment description'

const PAYMENT_AMOUNT_HEADER = 'PaymentAmount'
const PAYMENT_AMOUNT_HEADER_TEXT = 'Payment amount'

const PAYMENT_REFERENCE_HEADER = 'PaymentReference'
const PAYMENT_REFERENCE_HEADER_TEXT = 'Payment reference'

const PAYMENT_DATE_HEADER = 'PaymentDate'
const PAYMENT_DATE_HEADER_TEXT = 'Payment date'

const CSAT_FORM_ID = '691db72966b1bdc98fa3e72a'

/**
 * Fetches the form metadata
 * @param {string} formId - the form id
 */
export async function getMetadataFromForm(formId) {
  const metadata = await getFormMetadataById(formId)
  if (!metadata.notificationEmail) {
    throw new Error(`Missing notification email for form id ${formId}`)
  }
  return metadata
}

/**
 * Generate a form submission file for a form id
 * @param {string} formId - the form id
 */
export async function generateFormSubmissionsFile(formId) {
  const metadata = await getMetadataFromForm(formId)
  return generateSubmissionsFile(formId, metadata, metadata.title)
}

/**
 * Generate a feedback submission file for one or all forms
 * @param {UserCredentials} user - the actioning user
 */
export async function generateFeedbackSubmissionsFileForAll(user) {
  const removeColumns = new Set(['formId', 'SubmissionRef'])
  const userEmail =
    'preferred_username' in user
      ? /** @type {string} */ (user.preferred_username)
      : undefined

  if (!userEmail) {
    throw new Error('User email not found')
  }

  // Construct partial form metadata
  // - pass notificationEmail as requesting user's email address
  // - pass an empty formId to denote 'all forms', so the filter doesn't restrict results to a specific form
  const metadata = /** @type {FormMetadata} */ ({
    notificationEmail: userEmail,
    id: ''
  })

  return generateSubmissionsFile(
    CSAT_FORM_ID,
    metadata,
    'user feedback (all forms)',
    {
      includeFormName: true,
      removeColumns,
      isFeedbackForm: true
    }
  )
}

/**
 * Generate a feedback submission file for one or all forms
 * @param {string} formId - the form id
 */
export async function generateFeedbackSubmissionsFileForForm(formId) {
  const removeColumns = new Set(['formId', 'SubmissionRef'])

  const metadata = await getMetadataFromForm(formId)

  return generateSubmissionsFile(
    CSAT_FORM_ID,
    metadata,
    `user feedback for ${metadata.title}`,
    {
      filter: { 'data.main.formId': formId },
      includeFormName: true,
      removeColumns,
      isFeedbackForm: true
    }
  )
}

/**
 * @param {string} columnName - the column name
 * @param { Set<string> | undefined } columnsToRemove - the columns to omit
 */
export function allowColumn(columnName, columnsToRemove) {
  if (!columnsToRemove) {
    return true
  }

  return !columnsToRemove.has(columnName)
}

/**
 * Get the form model after fetching the form definition
 * @param {string} formId - the form id
 * @param {number | undefined} versionNumber - the form version
 * @param {FormStatus} formStatus - the form status
 */
export async function getFormModelFromDb(formId, versionNumber, formStatus) {
  const formDefinition = versionNumber
    ? await getFormDefinitionVersion(formId, versionNumber)
    : await getFormDefinition(formId, formStatus)

  return new FormModel(replaceCustomControllers(formDefinition), {
    basePath: '',
    versionNumber
  })
}

/**
 * Adds a cell to the spreadsheet row
 * @param {Map<string, CellValue>} row - the spreadsheet row
 * @param {string} columnName - the column name
 * @param {CellValue} columnValue - the column value
 * @param { SpreadsheetOptions | undefined } options - spreadsheet options
 */
export function addCellToRow(row, columnName, columnValue, options) {
  if (
    allowColumn(columnName, options?.removeColumns) ||
    (options?.includeFormName && columnName === SUBMISSION_FORM_NAME)
  ) {
    row.set(columnName, columnValue)
  }
}

/**
 * Coerce the value from text if the component is a
 * DatePartsField, MonthYearField or NumberField
 * @param {string | undefined} asText - the value as text
 * @param {Component} component - the form component
 * @returns {CellValue} the spreadsheet cell value
 */
export function coerceDataValue(asText, component) {
  if (asText) {
    if (
      component.type === ComponentType.DatePartsField ||
      component.type === ComponentType.MonthYearField
    ) {
      return new Date(asText)
    }
    if (component.type === ComponentType.NumberField) {
      return Number.parseFloat(asText)
    }
  }

  return asText
}

/**
 * Extracts the component value from the provided data and coerces to the appropriate type
 * @param {Record<string, any>} data - the answers data
 * @param {string} key - the component key (name)
 * @param {Component} component - the form component
 * @returns {CellValue}
 */
export function getValue(data, key, component) {
  const asText =
    key in data ? component.getDisplayStringFromFormValue(data[key]) : undefined

  return coerceDataValue(asText, component)
}

/**
 * Adds component and column header to the maps
 * @param {SpreadsheetContext} context - the context for spreadsheet generation
 * @param {Component} component - the form component
 * @param {string} [key] - the header key
 * @param {string} [value] - the header value
 */
function addHeader(
  context,
  component,
  key = component.name,
  value = component.label
) {
  if (!allowColumn(component.name, context.options?.removeColumns)) {
    return
  }

  const { components, headers } = context.caches
  if (!components.has(component.name)) {
    components.set(component.name, component)
  }

  if (!headers.has(key)) {
    headers.set(key, value)
  }
}

/**
 * Fetches form name from the cache or reads it into the cache
 * @param {SpreadsheetContext} context - the context for spreadsheet generation
 * @param {string} formId - the form id
 */
export async function lookupFormNameById(context, formId) {
  const { formNames } = context.caches

  if (formNames.has(formId)) {
    return /** @type {string} */ (formNames.get(formId))
  } else {
    try {
      const meta = await getFormMetadataById(formId)

      formNames.set(formId, meta.title)

      return meta.title
    } catch {
      // Form not found (it's possible there are submissions from a now-deleted draft form)
      // Cache the 'not found' result to avoid having to have a failed lookup on that same form again
      formNames.set(formId, '')
      return ''
    }
  }
}

/**
 * Fetches form definition and builds the form model or gets them from cache
 * @param {SpreadsheetContext} context - the context for spreadsheet generation
 * @param {string} formId - the form id
 * @param {number | undefined} versionNumber - the form version
 * @param {FormStatus} formStatus - the form status
 */
export async function getFormModel(context, formId, versionNumber, formStatus) {
  const { models } = context.caches
  if (models.has(versionNumber)) {
    return models.get(versionNumber)
  } else {
    const formModel = await getFormModelFromDb(
      formId,
      versionNumber,
      formStatus
    )

    models.set(versionNumber, formModel)

    return formModel
  }
}

/**
 * @param {string} formId - the id of the form
 * @param {Map<string, CellValue>} row - data row
 * @param {SpreadsheetContext} context - context of the spreadsheet
 * @param {WithId<FormSubmissionDocument>} record - a submission record
 * @param { SpreadsheetOptions | undefined } [options] - add a filter and/or additionalColumns
 */
export async function addFirstCellsToRow(
  formId,
  row,
  context,
  record,
  options
) {
  const { versionNumber, submissionRef, submissionDate, status, isPreview } =
    extractMeta(record)
  const formModel = await getFormModel(context, formId, versionNumber, status)

  addCellToRow(row, SUBMISSION_REF_HEADER, submissionRef, options)
  addCellToRow(row, SUBMISSION_DATE_HEADER, submissionDate, options)
  addCellToRow(row, SUBMISSION_STATUS_HEADER, status, options)
  addCellToRow(
    row,
    SUBMISSION_ISPREVIEW_HEADER,
    isPreview ? 'Yes' : 'No',
    options
  )

  return {
    formModel
  }
}

/**
 * Add form component cells to a row
 * @param {FormModel | undefined} formModel - the form model
 * @param {Map<string, CellValue>} row - the row to add cells to
 * @param {SpreadsheetContext} context - the spreadsheet context
 * @param {WithId<FormSubmissionDocument>} record - the submission record
 * @param {SpreadsheetOptions | undefined} [options] - spreadsheet options
 */
function addFormComponentCellsToRow(formModel, row, context, record, options) {
  formModel?.componentMap.forEach((component, key) => {
    if (!component.isFormComponent) {
      return
    }

    if (hasRepeater(component.page.pageDef)) {
      const repeaterName = component.page.pageDef.repeat.options.name
      const hasRepeaterData = repeaterName in record.data.repeaters
      const items = hasRepeaterData ? record.data.repeaters[repeaterName] : []

      for (let index = 0; index < items.length; index++) {
        const value = getValue(items[index], key, component)
        const componentKey = `${component.name} ${index + 1}`
        const componentValue = `${component.label} ${index + 1}`

        addCellToRow(row, componentKey, value, options)
        addHeader(context, component, componentKey, componentValue)
      }
    } else if (component.type === ComponentType.FileUploadField) {
      const files = record.data.files[component.name]
      const fileLinks = Array.isArray(files)
        ? files.map((f) => f.userDownloadLink).join(' \r\n')
        : ''

      addCellToRow(row, component.name, fileLinks, options)
      addHeader(context, component)
    } else {
      const value = getValue(record.data.main, key, component)

      addCellToRow(row, component.name, value, options)
      addHeader(context, component)
    }
  })
}

/**
 * Adds a header if not already present
 * @param {Map<string, string>} headers - the headers map
 * @param {string} key - the header key
 * @param {string} value - the header display text
 */
function addHeaderIfMissing(headers, key, value) {
  if (!headers.has(key)) {
    headers.set(key, value)
  }
}

/**
 * Add payment cells to a row if payment data exists
 * @param {Map<string, CellValue>} row - the row to add cells to
 * @param {Caches} caches - the spreadsheet caches
 * @param {WithId<FormSubmissionDocument>} record - the submission record
 * @param {SpreadsheetOptions | undefined} [options] - spreadsheet options
 */
function addPaymentCellsToRow(row, caches, record, options) {
  const payment = record.data.payment
  if (!payment) {
    return
  }

  addCellToRow(row, PAYMENT_DESCRIPTION_HEADER, payment.description, options)
  addHeaderIfMissing(
    caches.headers,
    PAYMENT_DESCRIPTION_HEADER,
    PAYMENT_DESCRIPTION_HEADER_TEXT
  )

  addCellToRow(
    row,
    PAYMENT_AMOUNT_HEADER,
    formatPaymentAmount(payment.amount),
    options
  )
  addHeaderIfMissing(
    caches.headers,
    PAYMENT_AMOUNT_HEADER,
    PAYMENT_AMOUNT_HEADER_TEXT
  )

  addCellToRow(row, PAYMENT_REFERENCE_HEADER, payment.reference, options)
  addHeaderIfMissing(
    caches.headers,
    PAYMENT_REFERENCE_HEADER,
    PAYMENT_REFERENCE_HEADER_TEXT
  )

  if (payment.createdAt) {
    addCellToRow(
      row,
      PAYMENT_DATE_HEADER,
      formatPaymentDate(payment.createdAt),
      options
    )
    addHeaderIfMissing(
      caches.headers,
      PAYMENT_DATE_HEADER,
      PAYMENT_DATE_HEADER_TEXT
    )
  }
}

/**
 * Generate a submission file for a form id
 * @param {string} formId - the form id
 * @param {FormMetadata} metadata - metadata of the form
 * @param {string} emailTitle - title text used in email content
 * @param { SpreadsheetOptions | undefined } [options] - add a filter and/or additionalColumns
 */
export async function generateSubmissionsFile(
  formId,
  metadata,
  emailTitle,
  options
) {
  logger.info(`Generating and sending submissions file for form ${formId}`)

  const caches = createCaches()
  const { components, headers, rows } = caches
  const context = { caches, options }

  /** @type {string} */
  for await (const record of getSubmissionRecords(formId, options?.filter)) {
    const formNameFromId = await lookupFormNameById(
      context,
      record.data.main.formId ?? record.meta.formId
    )
    if (!formNameFromId) {
      // Exclude feedback submissions where the form no longer exists
      continue
    }

    /** @type {Map<string, CellValue >} */
    const row = new Map()
    const { formModel } = await addFirstCellsToRow(
      formId,
      row,
      context,
      record,
      options
    )

    addCellToRow(row, SUBMISSION_FORM_NAME, formNameFromId, options)
    addFormComponentCellsToRow(formModel, row, context, record, options)
    addPaymentCellsToRow(row, caches, record, options)

    rows.push(row)
  }

  // Build the Excel workbook
  const workbook = buildExcelFile(
    formId,
    sortHeaders(components, headers),
    rows.toReversed(),
    options
  )

  const { notificationEmail } = /** @type {{ notificationEmail: string }} */ (
    metadata
  )

  // Save the Excel workbook to S3
  const fileId = await saveFileToS3(workbook, formId, notificationEmail)

  // Finally send the submission file download email
  await sendSubmissionsFileEmail(formId, emailTitle, notificationEmail, fileId)

  logger.info(`Generated and sent submissions file for form ${formId}`)

  return { fileId }
}

/**
 * Create the caches used while generating the submission file
 */
function createCaches() {
  /**
   * Cache for FormModels
   * @type {Map<number | undefined, FormModel>}
   */
  const models = new Map()

  /**
   * Array of worksheet rows
   * @type {Map<string, CellValue >[]}
   */
  const rows = []

  /**
   * Map of unique components
   * @type {Map<string, Component>}
   */
  const components = new Map()

  /**
   * Map of worksheet columns
   * @type {Map<string, string>}
   */
  const headers = new Map()

  /**
   * Cache for Form ids vs names
   * @type {Map<string, string>}
   */
  const formNames = new Map()

  return { components, headers, models, rows, formNames }
}

/**
 * Extract the metadata details
 * @param {FormSubmissionDocument} record
 */
function extractMeta(record) {
  const meta = record.meta
  const submissionRef = meta.referenceNumber
  const submissionDate = new Date(meta.timestamp)
  const versionNumber = meta.versionMetadata?.versionNumber
  const isPreview = meta.isPreview
  const status = meta.status

  return { versionNumber, submissionRef, submissionDate, isPreview, status }
}

/**
 * Sort headers to ensure repeaters are:
 * Pizza 1, Quantity 1, Pizza 2, Quantity 2 rather than
 * Pizza 1, Pizza 2, Quantity 1, Quantity 2
 * @param {Map<string, Component>} components - the unique components map
 * @param {Map<string, string>} headers - the unsorted headers
 */
function sortHeaders(components, headers) {
  const componentNames = Array.from(components.keys())

  return Array.from(headers.entries()).sort((a, b) => {
    const partsA = a[0].split(' ')
    const partsB = b[0].split(' ')
    const nameA = partsA[0]
    const nameB = partsB[0]

    // If a and b are components from the same repeater
    // page, then order them by their repeater index
    if (partsA.length === 2 && partsB.length === 2) {
      const repeaterComponentA = components.get(nameA)
      const repeaterComponentB = components.get(nameB)

      if (repeaterComponentA.page === repeaterComponentB.page) {
        return Number(partsA[1]) - Number(partsB[1])
      }
    }

    // Otherwise sort them using their unique index
    const idxA = componentNames.indexOf(nameA)
    const idxB = componentNames.indexOf(nameB)

    // Both not found -> keep original order
    if (idxA === -1 && idxB === -1) {
      return 0
    }

    // A not found, B found -> A goes after B
    if (idxA === -1) {
      return 1
    }

    // A found, B not found -> A goes before B
    if (idxB === -1) {
      return -1
    }

    return idxA - idxB
  })
}

/**
 * @param { SpreadsheetOptions | undefined } options
 */
export function buildPreHeaders(options) {
  const wsPreHeaders = []

  const addSubmissionRef = allowColumn(
    SUBMISSION_REF_HEADER,
    options?.removeColumns
  )
  const addFormName = options?.includeFormName

  if (addSubmissionRef) {
    wsPreHeaders.push(SUBMISSION_REF_HEADER_TEXT)
  }
  wsPreHeaders.push(
    SUBMISSION_DATE_HEADER_TEXT,
    SUBMISSION_STATUS_HEADER_TEXT,
    SUBMISSION_ISPREVIEW_HEADER_TEXT
  )
  if (addFormName) {
    wsPreHeaders.push(SUBMISSION_FORM_NAME_TEXT)
  }
  return wsPreHeaders
}

/**
 * Build an xlsx workbook from the headers and rows
 * @param {string} formId - the form id
 * @param {[string, string][]} headers - the file headers (including payment headers)
 * @param {Map<string, CellValue >[]} rows - the data rows
 * @param {SpreadsheetOptions} [options]
 */
function buildExcelFile(formId, headers, rows, options) {
  logger.info(`Building the XLSX file for form ${formId}`)

  const wsPreHeaders = buildPreHeaders(options)
  const preHeaderSet = new Set(wsPreHeaders)

  const wsHeaders = wsPreHeaders.concat(headers.map(([, label]) => label))

  /** @type {(CellValue)[][]} */
  const wsRows = []

  rows.forEach((row) => {
    /** @type {(CellValue)[]} */
    const wsRow = []

    if (preHeaderSet.has(SUBMISSION_REF_HEADER_TEXT)) {
      wsRow.push(row.get(SUBMISSION_REF_HEADER))
    }
    wsRow.push(
      row.get(SUBMISSION_DATE_HEADER),
      row.get(SUBMISSION_STATUS_HEADER),
      row.get(SUBMISSION_ISPREVIEW_HEADER)
    )
    if (preHeaderSet.has(SUBMISSION_FORM_NAME_TEXT)) {
      wsRow.push(row.get(SUBMISSION_FORM_NAME))
    }

    headers.forEach(([key]) => {
      wsRow.push(row.get(key))
    })

    wsRows.push(wsRow)
  })

  // Create an excel file from the data and save
  const worksheet = xlsx.utils.aoa_to_sheet([wsHeaders, ...wsRows], {
    dateNF: 'dd/mm/yyyy'
  })
  const workbook = xlsx.utils.book_new()

  xlsx.utils.book_append_sheet(workbook, worksheet)

  logger.info(`Built the XLSX file for form ${formId}`)

  return workbook
}

/**
 * Save the Excel file to S3
 * @param {WorkBook} workbook - the Excel wookbook
 * @param {string} formId - the form id
 * @param {string} notificationEmail - the form notification email for the retrieval key
 */
async function saveFileToS3(workbook, formId, notificationEmail) {
  logger.info(`Saving the XLSX file to S3 for form ${formId}`)

  const buffer = xlsx.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer'
  })

  // Force case insensitivity for the password
  const retrievalKey = notificationEmail.toLowerCase()
  const retrievalKeyIsCaseSensitive = false
  const hashedRetrievalKey = await argon2.hash(retrievalKey)

  const { fileId } = await createSubmissionXlsxFile(
    buffer,
    hashedRetrievalKey,
    retrievalKeyIsCaseSensitive
  )

  logger.info(`Saved the XLSX file to S3 for form ${formId}`)

  return fileId
}

/**
 * Send the submission download email via Notify
 * @param {string} formId - the form id
 * @param {string} title - the form title
 * @param {string} notificationEmail - the form notification email
 * @param {string} fileId - the generated file id
 */
async function sendSubmissionsFileEmail(
  formId,
  title,
  notificationEmail,
  fileId
) {
  logger.info(`Sending the submission download email for form ${formId}`)

  const emailContent = constructEmailContent(notificationEmail, fileId, title)

  await sendNotification(emailContent)

  logger.info(`Sent the submission download email for form ${formId}`)
}

/**
 * Construct the submission file download email
 * @param {string} emailAddress - the recipient email address
 * @param {string} fileId - the file id
 * @param {string} formTitle - the form title
 */
export function constructEmailContent(emailAddress, fileId, formTitle) {
  const emailSubject = `File is ready to download - ${formTitle}`

  const emailBody = `The file you requested for '${formTitle}' is ready to download.

  [Download file](${designerUrl}/file-download/${fileId})

  ^ The link will expire in 90 days.

  From the Defra Forms team.
  `

  return {
    emailAddress,
    templateId: notifyTemplateId,
    personalisation: {
      subject: emailSubject,
      body: emailBody
    },
    emailReplyToId: notifyReplyToId
  }
}

/**
 * @import { WorkBook } from 'xlsx'
 * @import { UserCredentials } from '@hapi/hapi'
 * @import { FormMetadata, FormStatus } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 * @import { Component } from '@defra/forms-engine-plugin/engine/components/helpers/components.js'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
