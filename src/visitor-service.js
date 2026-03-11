import crypto from "node:crypto";
import { query } from "./db.js";

function normalizeIp(raw = "") {
  return String(raw || "").trim();
}

function getHeader(req, key) {
  const value = req.headers?.[key];
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "");
}

export function extractClientIp(req) {
  const forwarded = getHeader(req, "cf-connecting-ip")
    || getHeader(req, "x-real-ip")
    || getHeader(req, "x-forwarded-for");

  if (forwarded) {
    return normalizeIp(forwarded.split(",")[0]);
  }

  return normalizeIp(req.socket?.remoteAddress || req.ip || "");
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function sanitizePath(rawPath = "") {
  const value = String(rawPath || "").trim();
  if (!value) return "/";
  return value.slice(0, 255);
}

function sanitizeUserAgent(rawUserAgent = "") {
  const value = String(rawUserAgent || "").trim();
  return value ? value.slice(0, 1000) : "";
}

export async function recordDailyVisitor({ ip, path = "/", userAgent = "" }) {
  if (!ip) {
    return getTodayVisitorStats();
  }

  const ipHash = hashIp(ip);
  const safePath = sanitizePath(path);
  const safeUserAgent = sanitizeUserAgent(userAgent);

  await query(
    `
      INSERT INTO daily_visitors (visit_date, ip_hash, path, user_agent)
      VALUES (CURRENT_DATE, $1, $2, $3)
      ON CONFLICT (visit_date, ip_hash)
      DO UPDATE SET
        last_seen_at = NOW(),
        hit_count = daily_visitors.hit_count + 1,
        path = EXCLUDED.path,
        user_agent = EXCLUDED.user_agent
    `,
    [ipHash, safePath, safeUserAgent]
  );

  return getTodayVisitorStats();
}

export async function getTodayVisitorStats() {
  const result = await query(
    `
      SELECT
        CURRENT_DATE::text AS visit_date,
        COUNT(*)::int AS unique_visitors,
        COALESCE(SUM(hit_count), 0)::int AS total_hits
      FROM daily_visitors
      WHERE visit_date = CURRENT_DATE
    `
  );

  return result.rows[0] || {
    visit_date: new Date().toISOString().slice(0, 10),
    unique_visitors: 0,
    total_hits: 0
  };
}
