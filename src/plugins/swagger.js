import Inert from '@hapi/inert'
import Vision from '@hapi/vision'
import HapiSwagger from 'hapi-swagger'

const swaggerOptions = {
  info: {
    title: 'Defra Forms Submission API Documentation',
    description: 'This is the interface for **forms-submission-api**.'
  }
}

export const swagger = [
  Inert,
  Vision,
  {
    plugin: HapiSwagger,
    options: swaggerOptions
  }
]
