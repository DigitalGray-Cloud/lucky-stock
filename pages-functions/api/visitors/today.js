function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getVisitorApiBase(env = {}) {
  return String(
    env.VISITOR_API_BASE_URL
      || env.LUCKYSTOCK_API_BASE_URL
      || env.API_BASE_URL
      || ""
  ).trim().replace(/\/+$/, "");
}

function getClientIp(request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for");

  if (!forwarded) return "";
  return String(forwarded).split(",")[0].trim();
}

function getVisitDate(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function sanitizePath(path = "") {
  return String(path || "/").slice(0, 255);
}

function sanitizeUserAgent(userAgent = "") {
  return String(userAgent || "").slice(0, 1000);
}

async function readTodayStats(db, visitDate) {
  const result = await db.prepare(
    `SELECT COUNT(*) AS unique_visitors, COALESCE(SUM(hit_count), 0) AS total_hits
     FROM daily_visitors
     WHERE visit_date = ?1`
  ).bind(visitDate).first();

  return {
    visit_date: visitDate,
    unique_visitors: Number(result?.unique_visitors || 0),
    total_hits: Number(result?.total_hits || 0)
  };
}

async function trackVisitor(db, request, visitDate) {
  const ip = getClientIp(request);
  if (!ip) return readTodayStats(db, visitDate);

  const ipHash = await sha256Hex(ip);
  const url = new URL(request.url);
  const path = sanitizePath(url.searchParams.get("path") || url.pathname || "/");
  const userAgent = sanitizeUserAgent(request.headers.get("user-agent") || "");

  await db.prepare(
    `INSERT INTO daily_visitors (visit_date, ip_hash, path, user_agent)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(visit_date, ip_hash) DO UPDATE SET
       last_seen_at = CURRENT_TIMESTAMP,
       hit_count = daily_visitors.hit_count + 1,
       path = excluded.path,
       user_agent = excluded.user_agent`
  ).bind(visitDate, ipHash, path, userAgent).run();

  return readTodayStats(db, visitDate);
}

async function handleD1Counter(context) {
  const { request, env } = context;
  const db = env.luckystock_visitors;
  if (!db) return null;

  const visitDate = getVisitDate();
  const url = new URL(request.url);
  const shouldTrack = url.searchParams.get("track") !== "0";
  const stats = shouldTrack
    ? await trackVisitor(db, request, visitDate)
    : await readTodayStats(db, visitDate);

  return json(stats);
}

async function fetchCounterApi(request) {
  const url = new URL(request.url);
  const track = url.searchParams.get("track") !== "0";
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateKey = kst.toISOString().slice(0, 10).replace(/-/g, "");
  const namespace = "luckystock";
  const key = `today-${dateKey}`;
  const method = track ? "up" : "get";

  const response = await fetch(
    `https://api.counterapi.dev/v1/${namespace}/${key}/${method}`,
    { headers: { "User-Agent": "LuckyStock-Visitor-Counter/1.0" } }
  );

  if (response.ok) {
    const data = await response.json();
    const count = Number(data?.count || 0);
    return json({ unique_visitors: count, total_hits: count, count, date: dateKey, ok: true });
  }

  if (track) {
    const fallback = await fetch(
      `https://api.counterapi.dev/v1/${namespace}/${key}/get`,
      { headers: { "User-Agent": "LuckyStock-Visitor-Counter/1.0" } }
    ).catch(() => null);
    if (fallback?.ok) {
      const data = await fallback.json();
      const count = Number(data?.count || 0);
      return json({ unique_visitors: count, total_hits: count, count, date: dateKey, ok: true });
    }
  }

  return json({ unique_visitors: 0, total_hits: 0, count: 0, date: dateKey, ok: false });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const d1Response = await handleD1Counter(context);
  if (d1Response) return d1Response;

  const apiBase = getVisitorApiBase(env);

  if (!apiBase) {
    return fetchCounterApi(request);
  }

  const upstreamUrl = new URL("/api/visitors/today", `${apiBase}/`);
  const incomingUrl = new URL(request.url);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers();
  headers.set("accept", "application/json");

  const forwardedHeaders = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "user-agent"];
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers
    });
    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      }
    });
  } catch (error) {
    return json(
      {
        error: "visitor_proxy_failed",
        message: String(error?.message || error),
        unique_visitors: 0,
        total_hits: 0
      },
      { status: 502 }
    );
  }
}
