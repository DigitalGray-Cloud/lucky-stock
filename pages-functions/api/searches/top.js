function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function ensureSearchTable(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS stock_searches (
      search_date TEXT NOT NULL,
      code TEXT NOT NULL,
      source TEXT NOT NULL,
      first_searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      hit_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (search_date, code, source)
    )`
  ).run();
}

export async function onRequestGet(context) {
  const db = context.env.luckystock_visitors;
  if (!db) {
    return json({ items: [], source: "no_d1" });
  }

  await ensureSearchTable(db);

  const url = new URL(context.request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 30)));
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") || 7)));

  const rows = await db.prepare(
    `SELECT
       code,
       SUM(hit_count) AS hits,
       MAX(last_searched_at) AS last_searched_at
     FROM stock_searches
     WHERE search_date >= date('now', '+9 hours', ?1)
     GROUP BY code
     ORDER BY hits DESC, last_searched_at DESC
     LIMIT ?2`
  ).bind(`-${days - 1} days`, limit).all();

  const items = Array.isArray(rows?.results) ? rows.results.map((row) => ({
    code: String(row.code || ""),
    hits: Number(row.hits || 0),
    last_searched_at: String(row.last_searched_at || "")
  })) : [];

  return json({ items, days, limit });
}
