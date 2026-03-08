import { pool } from "../src/db.js";
import { logBatchEnd, logBatchStart, refreshRanking } from "../src/stock-service.js";

async function main() {
  const batchId = await logBatchStart("ranking_hourly");
  try {
    await refreshRanking(50);
    await logBatchEnd(batchId, "success", "top50 refreshed");
    console.log("[batch:ranking] done top50 refreshed");
  } catch (err) {
    await logBatchEnd(batchId, "failed", String(err?.message || err));
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("[batch:ranking] failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
