import { pool, query } from "../src/db.js";
import { analyzeStock, logBatchEnd, logBatchStart } from "../src/stock-service.js";

async function main() {
  const batchId = await logBatchStart("daily_analysis");
  try {
    const rs = await query("SELECT code FROM stocks ORDER BY code ASC");
    const codes = rs.rows.map((r) => r.code);

    console.log(`[batch:daily] target=${codes.length}`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      try {
        await analyzeStock(code);
        success += 1;
      } catch {
        failed += 1;
      }

      if ((i + 1) % 50 === 0) {
        console.log(`[batch:daily] progress ${i + 1}/${codes.length} success=${success} failed=${failed}`);
      }
    }

    await logBatchEnd(batchId, "success", `success=${success}, failed=${failed}`);
    console.log(`[batch:daily] done success=${success} failed=${failed}`);
  } catch (err) {
    await logBatchEnd(batchId, "failed", String(err?.message || err));
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("[batch:daily] failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
