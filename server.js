import path from "node:path";
import express from "express";
import { config } from "./src/config.js";
import { pingDatabase } from "./src/db.js";
import {
  analyzeStock,
  findStocks,
  getBatchState,
  getDbStatus,
  getRecentAnalyses,
  getTopStocks
} from "./src/stock-service.js";
import { createIpRateLimiter } from "./src/rateLimit.js";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(createIpRateLimiter({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }));

app.get("/api/health", async (_req, res) => {
  try {
    await pingDatabase();
    const batch = await getBatchState();
    res.json({ status: "ok", database: "connected", batch });
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected", message: String(err?.message || err) });
  }
});

app.get("/api/db-status", async (_req, res) => {
  try {
    const status = await getDbStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "db_status_failed", message: String(err?.message || err) });
  }
});

app.get("/api/analyze", async (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "invalid_code", message: "code must be 6 digits" });
    return;
  }

  try {
    const result = await analyzeStock(code);
    res.json({
      code: result.code,
      summary: result.summary,
      favor_score: result.favor_score,
      signal: result.signal,
      bull_points: result.bull_points,
      future_outlook: result.future_outlook,
      risk: result.risk,
      foreign_flow: result.foreign_flow,
      updated_at: result.updated_at,
      cache_hit: result.cache_hit,
      analysis_source: result.analysis_source || "cache"
    });
  } catch (err) {
    if (err?.statusCode === 404) {
      res.status(404).json({ error: "stock_not_found" });
      return;
    }
    res.status(500).json({ error: "analysis_failed", message: String(err?.message || err) });
  }
});

app.get("/api/top-stocks", async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  try {
    const top = await getTopStocks(limit);
    res.json({ top });
  } catch (err) {
    res.status(500).json({ error: "top_stocks_failed", message: String(err?.message || err) });
  }
});

app.get("/api/recent-analysis", async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 30)));
  try {
    const items = await getRecentAnalyses(limit);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "recent_analysis_failed", message: String(err?.message || err) });
  }
});

app.get("/api/autocomplete", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json({ items: [] });
    return;
  }
  try {
    const items = await findStocks(q, 10);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "autocomplete_failed", message: String(err?.message || err) });
  }
});

app.use(express.static(config.staticDir, { index: false }));
app.get("/", (_req, res) => {
  res.sendFile(path.join(config.staticDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`[api] LuckyStock backend listening on http://localhost:${config.port}`);
});
