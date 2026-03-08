import { query, withTransaction } from "./db.js";
import { config } from "./config.js";
import { generateStockAnalysis } from "./ai.js";

export async function getStockByCode(code) {
  const rs = await query(
    `SELECT code, name, market, sector, created_at FROM stocks WHERE code=$1`,
    [code]
  );
  return rs.rows[0] || null;
}

export async function findStocks(keyword, limit = 10) {
  const q = `%${keyword}%`;
  const rs = await query(
    `SELECT code, name, market, sector
     FROM stocks
     WHERE code LIKE $1 OR name ILIKE $1
     ORDER BY name ASC
     LIMIT $2`,
    [q, limit]
  );
  return rs.rows;
}

function isCacheValid(updatedAt) {
  if (!updatedAt) return false;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs <= config.analysisCacheHours * 60 * 60 * 1000;
}

export async function getCachedAnalysis(code) {
  const rs = await query(
    `SELECT code, summary, favor_score, signal, bull_points, future_outlook, risk, foreign_flow, updated_at
     FROM stock_analysis
     WHERE code=$1`,
    [code]
  );

  if (!rs.rows[0]) return null;

  const row = rs.rows[0];
  return {
    code: row.code,
    summary: row.summary,
    favor_score: row.favor_score,
    signal: row.signal,
    bull_points: JSON.parse(row.bull_points || "[]"),
    future_outlook: row.future_outlook,
    risk: row.risk,
    foreign_flow: row.foreign_flow,
    updated_at: row.updated_at,
    cache_valid: isCacheValid(row.updated_at)
  };
}

export async function upsertAnalysis(code, analysis) {
  await query(
    `INSERT INTO stock_analysis (code, summary, favor_score, signal, bull_points, future_outlook, risk, foreign_flow, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (code)
     DO UPDATE SET
       summary=EXCLUDED.summary,
       favor_score=EXCLUDED.favor_score,
       signal=EXCLUDED.signal,
       bull_points=EXCLUDED.bull_points,
       future_outlook=EXCLUDED.future_outlook,
       risk=EXCLUDED.risk,
       foreign_flow=EXCLUDED.foreign_flow,
       updated_at=NOW()`,
    [
      code,
      analysis.summary,
      analysis.favorScore,
      analysis.signal,
      JSON.stringify(analysis.bullPoints),
      analysis.futureOutlook,
      analysis.risk,
      analysis.foreignFlow
    ]
  );
}

export async function analyzeStock(code) {
  const stock = await getStockByCode(code);
  if (!stock) {
    const err = new Error("stock_not_found");
    err.statusCode = 404;
    throw err;
  }

  const cached = await getCachedAnalysis(code);
  if (cached?.cache_valid) {
    return { ...cached, cache_hit: true };
  }

  const generated = await generateStockAnalysis(stock);
  await upsertAnalysis(code, generated);
  const fresh = await getCachedAnalysis(code);

  return {
    ...fresh,
    cache_hit: false,
    analysis_source: generated.source
  };
}

export async function refreshRanking(limit = 50) {
  return withTransaction(async (client) => {
    await client.query("DELETE FROM stock_ranking");
    await client.query(
      `INSERT INTO stock_ranking (code, favor_score, rank, updated_at)
       SELECT code, favor_score, ROW_NUMBER() OVER (ORDER BY favor_score DESC, updated_at DESC), NOW()
       FROM stock_analysis
       ORDER BY favor_score DESC, updated_at DESC
       LIMIT $1`,
      [limit]
    );
  });
}

export async function getTopStocks(limit = 50) {
  const rs = await query(
    `SELECT r.code, r.favor_score, r.rank, s.name, s.market
     FROM stock_ranking r
     JOIN stocks s ON s.code = r.code
     ORDER BY r.rank ASC
     LIMIT $1`,
    [limit]
  );
  return rs.rows;
}

export async function getRecentAnalyses(limit = 30) {
  const rs = await query(
    `SELECT a.code, s.name, a.summary, a.favor_score, a.signal, a.updated_at
     FROM stock_analysis a
     JOIN stocks s ON s.code = a.code
     ORDER BY a.updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return rs.rows;
}

export async function getDbStatus() {
  const [stocks, analysis, ranking] = await Promise.all([
    query("SELECT COUNT(*)::int AS cnt FROM stocks"),
    query("SELECT COUNT(*)::int AS cnt FROM stock_analysis"),
    query("SELECT COUNT(*)::int AS cnt FROM stock_ranking")
  ]);

  return {
    stocks: stocks.rows[0].cnt,
    analysis: analysis.rows[0].cnt,
    ranking: ranking.rows[0].cnt
  };
}

export async function getBatchState() {
  const rs = await query(
    `SELECT job_name, status, started_at, finished_at
     FROM batch_runs
     ORDER BY started_at DESC
     LIMIT 1`
  );
  const row = rs.rows[0];
  if (!row) return "unknown";
  return row.status === "running" ? "running" : "idle";
}

export async function logBatchStart(jobName) {
  const rs = await query(
    `INSERT INTO batch_runs (job_name, status, started_at)
     VALUES ($1, 'running', NOW())
     RETURNING id`,
    [jobName]
  );
  return rs.rows[0].id;
}

export async function logBatchEnd(id, status, message = null) {
  await query(
    `UPDATE batch_runs
     SET status=$2, message=$3, finished_at=NOW()
     WHERE id=$1`,
    [id, status, message]
  );
}
