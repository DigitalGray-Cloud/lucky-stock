import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.PGSSL === "disable" ? false : (process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined)
});

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function pingDatabase() {
  await query("SELECT 1");
}
