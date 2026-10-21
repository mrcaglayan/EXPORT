async function verifyStructure(connection) {
  const [columns] = await connection.execute(`
    SELECT COLUMN_NAME AS name, DATA_TYPE AS type, CHARACTER_MAXIMUM_LENGTH AS maxLength
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'application_metadata'
    ORDER BY ORDINAL_POSITION
  `);
  const expected = [
    { name: 'metadata_key', type: 'varchar', maxLength: 64 },
    { name: 'metadata_value', type: 'varchar', maxLength: 255 },
    { name: 'created_at', type: 'timestamp', maxLength: null },
  ];
  const [tables] = await connection.execute(`
    SELECT ENGINE AS engine, TABLE_COLLATION AS collation
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'application_metadata'
  `);
  const [primaryKey] = await connection.execute(`
    SELECT COLUMN_NAME AS name FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'application_metadata'
      AND index_name = 'PRIMARY' ORDER BY SEQ_IN_INDEX
  `);
  if (JSON.stringify(columns) !== JSON.stringify(expected)
      || tables[0]?.engine !== 'InnoDB' || tables[0]?.collation !== 'utf8mb4_0900_ai_ci'
      || primaryKey.length !== 1 || primaryKey[0]?.name !== 'metadata_key') {
    throw new Error('Foundation metadata table does not match the registered migration.');
  }
}

export default {
  key: 'm001_foundation',
  description: 'Create application identity metadata; no business data.',
  async up(connection) {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS application_metadata (
        metadata_key VARCHAR(64) NOT NULL PRIMARY KEY,
        metadata_value VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await verifyStructure(connection);
    await connection.execute(`
      INSERT INTO application_metadata (metadata_key, metadata_value)
      VALUES ('application', 'export-accounting')
      ON DUPLICATE KEY UPDATE metadata_key = metadata_key
    `);
  },
  async verify(connection) {
    await verifyStructure(connection);
    const [rows] = await connection.execute(
      "SELECT metadata_value FROM application_metadata WHERE metadata_key = 'application'",
    );
    if (rows[0]?.metadata_value !== 'export-accounting') {
      throw new Error('Foundation application identity does not match.');
    }
  },
};
