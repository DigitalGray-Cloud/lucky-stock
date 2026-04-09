import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import express from "express";
import { config } from "./src/config.js";
import { pingDatabase } from "./src/db.js";
import { getHomeCachePayload } from "./src/home-cache.js";
import {
  analyzeStock,
  findStocks,
  getBatchState,
  getDbStatus,
  getRecentAnalyses,
  getTopStocks
} from "./src/stock-service.js";
import { createIpRateLimiter } from "./src/rateLimit.js";
import { extractClientIp, getTodayVisitorStats, recordDailyVisitor } from "./src/visitor-service.js";

const app = express();
const feedbackDb = new Database(path.join(config.rootDir, "data", "feedback-board.db"));
feedbackDb.pragma("journal_mode = WAL");
feedbackDb.exec(`
  CREATE TABLE IF NOT EXISTS feedback_posts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const feedbackListStmt = feedbackDb.prepare(`
  SELECT id, name, message, created_at, updated_at
  FROM feedback_posts
  ORDER BY datetime(created_at) DESC, rowid DESC
`);
const feedbackGetStmt = feedbackDb.prepare(`
  SELECT id, name, message, password_hash, created_at, updated_at
  FROM feedback_posts
  WHERE id = ?
`);
const feedbackCreateStmt = feedbackDb.prepare(`
  INSERT INTO feedback_posts (id, name, message, password_hash, created_at, updated_at)
  VALUES (@id, @name, @message, @passwordHash, @createdAt, @updatedAt)
`);
const feedbackUpdateStmt = feedbackDb.prepare(`
  UPDATE feedback_posts
  SET name = @name,
      message = @message,
      updated_at = @updatedAt
  WHERE id = @id
`);
const feedbackDeleteStmt = feedbackDb.prepare(`DELETE FROM feedback_posts WHERE id = ?`);

function validateFeedbackName(name) {
  const value = String(name || "").trim();
  if (value.length > 24) return "이름은 24자 이하로 입력해 주세요.";
  return "";
}

function buildAnonymousFeedbackName() {
  const rows = feedbackDb.prepare(`
    SELECT name
    FROM feedback_posts
    WHERE name LIKE '아무개%'
  `).all();

  let maxNumber = 0;
  for (const row of rows) {
    const match = String(row?.name || "").match(/^아무개(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value;
  }

  return `아무개${maxNumber + 1}`;
}

function normalizeFeedbackName(name) {
  const value = String(name || "").trim();
  return value || buildAnonymousFeedbackName();
}

function validateFeedbackMessage(message) {
  const value = String(message || "").trim();
  if (!value) return "내용을 입력해 주세요.";
  if (value.length > 120) return "내용은 120자 이하로 입력해 주세요.";
  return "";
}

const FEEDBACK_MASTER_DELETE_PASSWORD = "8367";

function validateFeedbackPassword(password) {
  const value = String(password || "").trim();
  if (!value) return "비밀번호를 입력해 주세요.";
  if (value.length > 20) return "비밀번호는 20자 이하로 입력해 주세요.";
  return "";
}

function hashFeedbackPassword(password) {
  return crypto.createHash("sha256").update(String(password || "").trim()).digest("hex");
}

function serializeFeedbackPost(row) {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

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

app.get("/api/home-cache", (_req, res) => {
  try {
    res.set("Cache-Control", "no-store").json(getHomeCachePayload());
  } catch (err) {
    res.status(500).json({ error: "home_cache_failed", message: String(err?.message || err) });
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

app.get("/api/visitors/today", async (req, res) => {
  const shouldTrack = String(req.query.track || "1") !== "0";

  try {
    const stats = shouldTrack
      ? await recordDailyVisitor({
          ip: extractClientIp(req),
          path: String(req.query.path || req.path || "/"),
          userAgent: req.get("user-agent") || ""
        })
      : await getTodayVisitorStats();

    res.json({
      visit_date: stats.visit_date,
      unique_visitors: Number(stats.unique_visitors || 0),
      total_hits: Number(stats.total_hits || 0)
    });
  } catch (err) {
    res.status(500).json({ error: "visitor_stats_failed", message: String(err?.message || err) });
  }
});

app.get("/api/feedback-posts", (_req, res) => {
  try {
    const items = feedbackListStmt.all().map(serializeFeedbackPost);
    res.set("Cache-Control", "no-store").json({ items });
  } catch (err) {
    res.status(500).json({ error: "feedback_load_failed", message: String(err?.message || err) });
  }
});

app.post("/api/feedback-posts", (req, res) => {
  const { name, message, password } = req.body || {};
  const error = validateFeedbackName(name) || validateFeedbackMessage(message) || validateFeedbackPassword(password);
  if (error) {
    res.status(400).json({ error: "invalid_input", message: error });
    return;
  }

  const timestamp = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    name: normalizeFeedbackName(name),
    message: String(message).trim(),
    passwordHash: hashFeedbackPassword(password),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  try {
    feedbackCreateStmt.run(row);
    res.status(201).json({
      item: serializeFeedbackPost({
        id: row.id,
        name: row.name,
        message: row.message,
        created_at: row.createdAt,
        updated_at: row.updatedAt
      })
    });
  } catch (err) {
    res.status(500).json({ error: "feedback_create_failed", message: String(err?.message || err) });
  }
});

app.put("/api/feedback-posts/:id", (req, res) => {
  const { id } = req.params;
  const { name, message, password } = req.body || {};
  const error = validateFeedbackName(name) || validateFeedbackMessage(message) || validateFeedbackPassword(password);
  if (error) {
    res.status(400).json({ error: "invalid_input", message: error });
    return;
  }

  try {
    const existing = feedbackGetStmt.get(id);
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "대상을 찾을 수 없습니다." });
      return;
    }
    if (existing.password_hash !== hashFeedbackPassword(password)) {
      res.status(403).json({ error: "invalid_password", message: "비밀번호가 맞지 않습니다." });
      return;
    }

    const updatedAt = new Date().toISOString();
    const normalizedName = normalizeFeedbackName(name);
    feedbackUpdateStmt.run({ id, name: normalizedName, message: String(message).trim(), updatedAt });
    res.json({
      item: serializeFeedbackPost({
        ...existing,
        name: normalizedName,
        message: String(message).trim(),
        updated_at: updatedAt
      })
    });
  } catch (err) {
    res.status(500).json({ error: "feedback_update_failed", message: String(err?.message || err) });
  }
});

app.delete("/api/feedback-posts/:id", (req, res) => {
  const { id } = req.params;
  const password = req.body?.password;
  const error = validateFeedbackPassword(password);
  if (error) {
    res.status(400).json({ error: "invalid_input", message: error });
    return;
  }

  try {
    const existing = feedbackGetStmt.get(id);
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "대상을 찾을 수 없습니다." });
      return;
    }
    const passwordValue = String(password || "").trim();
    if (passwordValue !== FEEDBACK_MASTER_DELETE_PASSWORD && existing.password_hash !== hashFeedbackPassword(passwordValue)) {
      res.status(403).json({ error: "invalid_password", message: "비밀번호가 맞지 않습니다." });
      return;
    }

    feedbackDeleteStmt.run(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "feedback_delete_failed", message: String(err?.message || err) });
  }
});

app.use(express.static(config.staticDir, { index: false }));
app.get("/stock/:code", (req, res) => {
  res.sendFile(path.join(config.staticDir, "stock", String(req.params.code || ""), "index.html"));
});
app.get("/stock/:code/", (req, res) => {
  res.sendFile(path.join(config.staticDir, "stock", String(req.params.code || ""), "index.html"));
});
app.get("/theme/:slug", (req, res) => {
  res.sendFile(path.join(config.staticDir, "theme", String(req.params.slug || ""), "index.html"));
});
app.get("/theme/:slug/", (req, res) => {
  res.sendFile(path.join(config.staticDir, "theme", String(req.params.slug || ""), "index.html"));
});
app.get("/", (_req, res) => {
  res.sendFile(path.join(config.staticDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`[api] LuckyStock backend listening on http://localhost:${config.port}`);
});
