import { getPool } from './pool.js';

export async function query(sql, parameters = [], executor = getPool()) {
  const [rows] = await executor.execute(sql, parameters);
  return { rows };
}

// DML only: MySQL DDL can commit implicitly and belongs in the migration runner.
// Never retry automatically: a lost commit response can have an unknown outcome.
export async function withTransaction(work, pool = getPool()) {
  const connection = await pool.getConnection();
  let started = false;
  let destroyed = false;
  try {
    await connection.beginTransaction();
    started = true;
    let savepointNumber = 0;
    const tx = {
      query: (sql, parameters = []) => query(sql, parameters, connection),
      async withSavepoint(nestedWork) {
        const name = `app_savepoint_${++savepointNumber}`;
        // MySQL savepoint control uses the text protocol; names are generated here.
        await connection.query(`SAVEPOINT ${name}`);
        try {
          const result = await nestedWork(tx);
          await connection.query(`RELEASE SAVEPOINT ${name}`);
          return result;
        } catch (error) {
          try {
            await connection.query(`ROLLBACK TO SAVEPOINT ${name}`);
            await connection.query(`RELEASE SAVEPOINT ${name}`);
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Savepoint rollback failed.', { cause: error });
          }
          throw error;
        }
      },
    };
    const result = await work(tx);
    await connection.commit();
    return result;
  } catch (error) {
    if (started) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        connection.destroy();
        destroyed = true;
        throw new AggregateError([error, rollbackError], 'Transaction and rollback failed.', { cause: error });
      }
    } else {
      connection.destroy();
      destroyed = true;
    }
    throw error;
  } finally {
    if (!destroyed) connection.release();
  }
}
