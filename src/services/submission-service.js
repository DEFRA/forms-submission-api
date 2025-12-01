import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { hasRepeater } from '@defra/forms-model'
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

/**
 * Generate a submission file for a form id
 * @param {string} formId - the form id
 */
export async function generateSubmissionsFile(formId) {
  logger.info(`Generating and sending submissions file for form ${formId}`)

  const { title, notificationEmail } = await readFormMetadata(formId)

  // Get all submission records for the form
  const records = await readSubmissionRecords(formId)

  // From the submission records, work out the unique form definition versions
  const versions = findUniqueFormDefinitionVersions(records, formId)

  // Fetch all the unique form definitions
  const formDefinitions = await fetchFormDefinitions(versions, formId)

  // Build a `FormModel` for each form definition
  const formModels = buildFormModels(formDefinitions, formId, versions)

  // Work out the unique form components
  const uniqueComponents = findUniqueComponents(formModels, formId)

  // Build the Excel workbook
  const workbook = buildExcelFile(formId, records, uniqueComponents)

  // Save the Excel workbook to S3
  const fileId = await saveFileToS3(notificationEmail, workbook, formId)

  // Finally send the submission file download email
  await sendSubmissionsFileEmail(formId, title, notificationEmail, fileId)

  logger.info(`Generated and sent submissions file for form ${formId}`)

  return { fileId }
}

/**
 * Read form metadata
 * @param {string} formId - the form id
 */
async function readFormMetadata(formId) {
  logger.info(`Reading metadata for form ${formId}`)

  const { title, notificationEmail } = await getFormMetadataById(formId)

  if (!notificationEmail) {
    const msg = `No notification email configured forformId: ${formId}`

    logger.error(msg)

    throw Boom.badRequest(
      `No notification email configured forformId: ${formId}`
    )
  }

  logger.info(`Read metadata for form ${formId}`)

  return { title, notificationEmail }
}

/**
 * Read all submission records
 * @param {string} formId - the form id
 */
async function readSubmissionRecords(formId) {
  logger.info(`Reading submission records for form ${formId}`)

  const records = await getSubmissionRecords(formId)

  logger.info(`Read ${records.length} submission records for form ${formId}`)

  return records
}

/**
 * Finds unique form definition versions from all the submission
 * @param {FormSubmissionDocument[]} records - the form submission records
 * @param {string} formId - the form id
 */
function findUniqueFormDefinitionVersions(records, formId) {
  /** @type {Set<number>} */
  const uniqueVersions = new Set()

  records.forEach((rec) => {
    if (rec.meta.versionMetadata) {
      uniqueVersions.add(rec.meta.versionMetadata.versionNumber)
    }
  })

  // Reverse to ensure latest component version takes priority
  const versions = uniqueVersions.values().toArray().reverse()

  logger.info(
    `Found ${versions.length} unique form versions across ${records.length} records for form ${formId}`
  )

  return versions
}

/**
 * Fetch all of the unique form definition versions
 * @param {number[]} versions - the unique form definition versions
 * @param {string} formId - the form id
 */
async function fetchFormDefinitions(versions, formId) {
  logger.info(`Fetching ${versions.length} form definitions for form ${formId}`)

  // TODO: DS - limit the number of fetches here
  const formDefinitions = await Promise.all(
    versions.map((version) => getFormDefinitionVersion(formId, version))
  )

  logger.info(
    `Fetched ${formDefinitions.length} form definitions for form ${formId}`
  )

  return formDefinitions
}

/**
 * Build all the form models
 * @param {FormDefinition[]} formDefinitions - the form definitions
 * @param {string} formId - the form id
 * @param {number[]} versions
 */
function buildFormModels(formDefinitions, formId, versions) {
  logger.info(
    `Building ${formDefinitions.length} form models for form ${formId}`
  )

  const formModels = formDefinitions.map(
    (def, idx) =>
      new FormModel(def, { basePath: '', versionNumber: versions.at(idx) })
  )

  logger.info(`Built ${formModels.length} form models for form ${formId}`)

  return formModels
}

/**
 * Find the unique components across all form models
 * @param {FormModel[]} formModels
 * @param {string} formId - the form id
 */
function findUniqueComponents(formModels, formId) {
  const uniqueComponents = new Set(
    ...formModels.flatMap((model) => model.componentMap)
  )
    .values()
    .toArray()
    .filter(([, component]) => component.isFormComponent)

  logger.info(
    `Found ${uniqueComponents.length} unique form components across ${formModels.length} form models for form ${formId}`
  )

  return uniqueComponents
}

/**
 * Find the maximum number of repeater items across all submissions
 * @param {PageRepeat} repeaterPage - the repeater page
 * @param {FormSubmissionDocument[]} submissions - the form submissions
 */
function getMaxRepeaterItems(repeaterPage, submissions) {
  const name = repeaterPage.repeat.options.name

  return Math.max(
    ...submissions.map((submission) => {
      const repeaterData = submission.data.repeaters
      return name in repeaterData ? repeaterData[name].length : 0
    })
  )
}

/**
 *
 * @param {string} formId - the form id
 * @param {FormSubmissionDocument[]} records - the form submission records
 * @param {[string, Component][]} uniqueComponents - the unique components
 */
function buildExcelFile(formId, records, uniqueComponents) {
  logger.info(`Building the XLSX file for form ${formId}`)

  const processedRepeaters = new Set()

  /** @type {string[]} */
  const headers = []

  /** @type {string[][]} */
  const values = Array.from(new Array(records.length), () => [])

  uniqueComponents.forEach(([, component]) => {
    /**
     *
     * @param {Component} component - the component to add values for
     * @param {string} [repeaterName] - the repeater name
     * @param {number} [repeaterIndex] - the repeater index
     */
    function addValues(component, repeaterName, repeaterIndex) {
      records.forEach((record, i) => {
        const key = component.name

        let data
        if (!repeaterName) {
          data = record.data.main
        } else if (
          repeaterName in record.data.repeaters &&
          typeof repeaterIndex === 'number'
        ) {
          data = record.data.repeaters[repeaterName][repeaterIndex]
        }

        values[i].push(
          data && key in data
            ? component.getDisplayStringFromFormValue(data[key])
            : undefined
        )
      })
    }

    if (hasRepeater(component.page.pageDef)) {
      if (!processedRepeaters.has(component.page.pageDef)) {
        processedRepeaters.add(component.page.pageDef)
        const maxRepeaterItems = getMaxRepeaterItems(component.page, records)

        if (maxRepeaterItems > 0) {
          const repeaterName = component.page.pageDef.repeat.options.name
          const repeaterComponents = uniqueComponents.filter(
            ([, c]) => c.page === component.page
          )

          for (let index = 0; index < maxRepeaterItems; index++) {
            repeaterComponents.forEach(([, c]) => {
              headers.push(`${c.label} ${index + 1}`)
              addValues(c, repeaterName, index)
            })
          }
        }
      }
    } else {
      headers.push(component.label)
      addValues(component)
    }
  })

  // Create an excel file from the data and save
  const worksheet = xlsx.utils.aoa_to_sheet([headers, ...values])
  const workbook = xlsx.utils.book_new()

  xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet 1')

  logger.info(`Built the XLSX file for form ${formId}`)

  return workbook
}

/**
 * Save the Excel file to S3
 * @param {string} notificationEmail - the form notification email for the retrieval key
 * @param {*} workbook - the Excel wookbook
 * @param {string} formId - the form id
 */
async function saveFileToS3(notificationEmail, workbook, formId) {
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
 * @import { FormDefinition, PageRepeat } from '@defra/forms-model'
 * @import { FormSubmissionDocument } from '~/src/api/types.js'
 * @import { Component } from '@defra/forms-engine-plugin/engine/components/helpers/components.js'
 */
