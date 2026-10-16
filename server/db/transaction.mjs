/**
 * One transaction on one connection.
 *
 * Whatever has to land whole is written the same way: take a client, BEGIN, do the work,
 * COMMIT, ROLLBACK on any error, give the client back in a `finally`. It has been spelled out
 * by hand in a dozen places, and each copy is a chance to forget a half of it — a missing
 * ROLLBACK keeps its locks until the connection is recycled, a missing release takes a
 * connection out of the pool for good. New routes go through this; the older copies are left
 * as they are.
 *
 * `pool.query` cannot stand in for it: each call may run on a different connection, and a
 * transaction, like a lock, belongs to exactly one.
 */
import { pool } from "./pool.mjs";

/**
 * Runs `work` with a client inside a transaction and returns what it returns.
 *
 * @template T
 * @param {(client: import("pg").PoolClient) => Promise<T>} work
 * @param {{readOnly?: boolean}} [options] `readOnly` is for a read that builds its answer from
 *   several queries: it sees one moment of the database from its first query to its last,
 *   whoever commits meanwhile, and the database refuses any write or lock inside it.
 * @returns {Promise<T>}
 * @throws whatever `work` throws, after the rollback
 */
export async function withTransaction(work, { readOnly = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // The error that is thrown is the one that matters, not one from the rollback after it.
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
