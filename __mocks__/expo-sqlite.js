/**
 * Manual mock for expo-sqlite — auto-applied to any test that imports it
 * (directly or transitively), since native SQLite isn't available under Jest.
 */

function createMockDatabase() {
  return {
    getAllAsync:         jest.fn().mockResolvedValue([]),
    getFirstAsync:       jest.fn().mockResolvedValue(null),
    runAsync:            jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 0 }),
    execAsync:           jest.fn().mockResolvedValue(undefined),
    withTransactionAsync:jest.fn(async (cb) => { await cb() }),
    closeAsync:          jest.fn().mockResolvedValue(undefined),
  }
}

module.exports = {
  openDatabaseAsync:   jest.fn(() => Promise.resolve(createMockDatabase())),
  openDatabaseSync:    jest.fn(() => createMockDatabase()),
  deleteDatabaseAsync: jest.fn().mockResolvedValue(undefined),
  SQLiteProvider:      ({ children }) => children,
  useSQLiteContext:    jest.fn(() => createMockDatabase()),
  __createMockDatabase: createMockDatabase,
}
