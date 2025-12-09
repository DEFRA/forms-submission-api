import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import {
  ComponentType,
  hasRepeater,
  replaceCustomControllers
} from '@defra/forms-model'
import Boom from '@hapi/boom'
import argon2 from 'argon2'
import xlsx from 'xlsx'

import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { isRetrievalKeyCaseSensitive } from '~/src/helpers/retrieval-key/retrieval-key.js'
import { getSubmissionRecords } from '~/src/repositories/submission-repository.js'
import {
  getFormDefinitionVersion,
  getFormMetadataById
} from '~/src/services/forms-service.js'
import { sendNotification } from '~/src/services/notify.js'
import { createSubmissionXlsxFile } from '~/src/services/service-helpers.js'

const logger = createLogger()

const designerUrl = config.get('designerUrl')
const notifyTemplateId = config.get('notifyTemplateId')
const notifyReplyToId = config.get('notifyReplyToId')

const SUBMISSION_REF_HEADER = 'SubmissionRef'
const SUBMISSION_DATE_HEADER = 'SubmissionDate'

/**
 * Generate a submission file for a form id
 * @param {string} formId - the form id
 */
export async function generateSubmissionsFile(formId) {
  logger.info(`Generating and sending submissions file for form ${formId}`)

  const { components, headers, models, rows } = createCaches()
  const { title, notificationEmail } = await readFormMetadata(formId)

  /**
   * Adds component and column header to the maps
   * @param {Component} component - the form component
   * @param {string} [key] - the header key
   * @param {string} [value] - the header value
   */
  function addHeader(component, key = component.name, value = component.label) {
    if (!components.has(component.name)) {
      components.set(component.name, component)
    }
    if (!headers.has(key)) {
      headers.set(key, value)
    }
  }

  /**
   * Fetches form definition and builds the form model or gets them from cache
   * @param {number} versionNumber - the form version
   */
  async function getFormModel(versionNumber) {
    if (models.has(versionNumber)) {
      return models.get(versionNumber)
    } else {
      const formDefinition = await getFormDefinitionVersion(
        formId,
        versionNumber
      )
      const formModel = new FormModel(
        replaceCustomControllers(formDefinition),
        {
          basePath: '',
          versionNumber
        }
      )
      models.set(versionNumber, formModel)
      return formModel
    }
  }

  for await (const record of getSubmissionRecords(formId)) {
    /** @type {Map<string, string>} */
    const row = new Map()
    const { versionNumber, submissionRef, submissionDate } = extractMeta(record)
    const formModel = await getFormModel(versionNumber)

    row.set(SUBMISSION_REF_HEADER, submissionRef)
    row.set(SUBMISSION_DATE_HEADER, submissionDate.toISOString())

    formModel?.componentMap.forEach((component, key) => {
      /**
       * Extracts the component value from the provided data
       * @param {Record<string, any>} data - the answers data
       */
      function getValue(data) {
        return key in data
          ? component.getDisplayStringFromFormValue(data[key])
          : undefined
      }

      if (hasRepeater(component.page.pageDef)) {
        const repeaterName = component.page.pageDef.repeat.options.name
        const hasRepeaterData = repeaterName in record.data.repeaters
        const items = hasRepeaterData ? record.data.repeaters[repeaterName] : []

        for (let index = 0; index < items.length; index++) {
          const value = getValue(items[index])
          const componentKey = `${component.name} ${index + 1}`
          const componentValue = `${component.label} ${index + 1}`

          row.set(componentKey, value)
          addHeader(component, componentKey, componentValue)
        }
      } else if (component.type === ComponentType.FileUploadField) {
        const files = record.data.files[component.name]
        const fileCount = Array.isArray(files) ? files.length : 0

        row.set(component.name, fileCount.toString())
        addHeader(component)
      } else if (component.isFormComponent) {
        const value = getValue(record.data.main)

        row.set(component.name, value)
        addHeader(component)
      }
    })
    rows.push(row)
  }

  // Build the Excel workbook
  const workbook = buildExcelFile(
    formId,
    sortHeaders(components, headers),
    rows.toReversed()
  )

  // Save the Excel workbook to S3
  const fileId = await saveFileToS3(workbook, formId, notificationEmail)

  // Finally send the submission file download email
  await sendSubmissionsFileEmail(formId, title, notificationEmail, fileId)

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
   * @type {Map<string, string>[]}
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
  return { components, headers, models, rows }
}

/**
 * Read form metadata
 * @param {string} formId - the form id
 */
async function readFormMetadata(formId) {
  logger.info(`Reading metadata for form ${formId}`)

  const { title, notificationEmail } = await getFormMetadataById(formId)

  if (!notificationEmail) {
    const msg = `No notification email configured for formId: ${formId}`

    logger.error(msg)

    throw Boom.badRequest(
      `No notification email configured for formId: ${formId}`
    )
  }

  logger.info(`Read metadata for form ${formId}`)

  return { title, notificationEmail }
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

  if (!versionNumber) {
    throw new Error('Unexpected empty version number in metadata')
  }

  return { versionNumber, submissionRef, submissionDate }
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

    return idxA - idxB
  })
}

/**
 * Build an xlsx workbook from the headers and rows
 * @param {string} formId - the form id
 * @param {[string, string][]} headers - the file header
 * @param {Map<string, string>[]} rows - the data rows
 */
function buildExcelFile(formId, headers, rows) {
  logger.info(`Building the XLSX file for form ${formId}`)

  const wsHeaders = ['Submission reference number', 'Submission date'].concat(
    headers.map(([, label]) => label)
  )

  /** @type {(string | undefined)[][]} */
  const wsRows = []

  rows.forEach((row) => {
    /** @type {(string | undefined)[]} */
    const wsRow = []

    wsRow.push(row.get(SUBMISSION_REF_HEADER), row.get(SUBMISSION_DATE_HEADER))

    headers.forEach(([key]) => {
      wsRow.push(row.get(key))
    })

    wsRows.push(wsRow)
  })

  // Create an excel file from the data and save
  const worksheet = xlsx.utils.aoa_to_sheet([wsHeaders, ...wsRows])
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

  const { retrievalKey } = { retrievalKey: notificationEmail }
  const retrievalKeyIsCaseSensitive = isRetrievalKeyCaseSensitive(retrievalKey)
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
 * @import { Component } from '@defra/forms-engine-plugin/engine/components/helpers/components.js'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 */
