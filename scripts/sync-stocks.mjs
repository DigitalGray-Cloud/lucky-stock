import { pool, withTransaction } from "../src/db.js";
import { fetchKrxMaster } from "./_krx.mjs";
import { logBatchEnd, logBatchStart } from "../src/stock-service.js";

async function main() {
  const batchId = await logBatchStart("sync_stocks");
  try {
    console.log("[batch:stocks] fetching KRX master...");
    const items = await fetchKrxMaster();
    console.log(`[batch:stocks] fetched=${items.length}`);

    await withTransaction(async (client) => {
      for (const s of items) {
        await client.query(
          `INSERT INTO stocks (code, name, market, sector, created_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (code)
           DO UPDATE SET
             name=EXCLUDED.name,
             market=EXCLUDED.market,
             sector=COALESCE(EXCLUDED.sector, stocks.sector)`,
          [s.code, s.name, s.market, s.sector]
        );
      }
    });

    await logBatchEnd(batchId, "success", `upserted=${items.length}`);
    console.log(`[batch:stocks] done upserted=${items.length}`);
  } catch (err) {
    await logBatchEnd(batchId, "failed", String(err?.message || err));
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("[batch:stocks] failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
