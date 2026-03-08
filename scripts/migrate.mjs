import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, pool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sqlPath = path.join(__dirname, "..", "sql", "001_init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await query(sql);
  console.log("[migrate] applied sql/001_init.sql");
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
