import { pool } from "../src/db.js";
import { getDbStatus } from "../src/stock-service.js";

async function main() {
  const status = await getDbStatus();
  console.log(JSON.stringify(status, null, 2));
}

main()
  .catch((err) => {
    console.error("[db:status] failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
