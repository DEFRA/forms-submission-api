/* eslint-env jest/globals */
export const buildMockCollection = () => {
  return {
    bulkWrite: jest.fn(),
    count: jest.fn(),
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
    deleteOne: jest.fn(),
    hint: jest.fn(),
    insertMany: jest.fn(),
    insertOne: jest.fn(),
    replaceOne: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
    aggregate: jest.fn(),
    createIndex: jest.fn(),
    createIndexes: jest.fn(),
    createSearchIndex: jest.fn(),
    createSearchIndexes: jest.fn(),
    distinct: jest.fn(),
    drop: jest.fn(),
    dropIndex: jest.fn(),
    dropIndexes: jest.fn(),
    dropSearchIndex: jest.fn(),
    estimatedDocumentCount: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    findOneAndReplace: jest.fn(),
    findOneAndUpdate: jest.fn(),
    indexExists: jest.fn(),
    indexInformation: jest.fn(),
    indexes: jest.fn(),
    initializeOrderedBulkOp: jest.fn(),
    initializeUnorderedBulkOp: jest.fn(),
    isCapped: jest.fn(),
    listIndexes: jest.fn(),
    listSearchIndexes: jest.fn(),
    rename: jest.fn(),
    updateSearchIndex: jest.fn(),
    options: jest.fn(),
    watch: jest.fn(),
    get readConcern() {
      return undefined
    },
    get readPreference() {
      return undefined
    },
    get namespace() {
      return ''
    },
    get writeConcern() {
      return undefined
    },
    get bsonOptions() {
      return {
        checkKeys: false,
        enableUtf8Validation: false,
        ignoreUndefined: false,
        raw: false,
        serializeFunctions: false
      }
    },
    get collectionName() {
      return ''
    },
    get dbName() {
      return ''
    },
    get timeoutMS() {
      return undefined
    }
  }
}
