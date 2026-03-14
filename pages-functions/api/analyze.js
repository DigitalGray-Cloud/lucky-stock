function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function decodeHtml(text = "") {
  return String(text)
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function convertGoogleNewsUrl(link) {
  if (!link) return "";
  if (link.startsWith("./")) return `https://news.google.com/${link.slice(2)}`;
  if (link.startsWith("/")) return `https://news.google.com${link}`;
  return link;
}

function parseRss(xmlText, limit = 5) {
  const items = [];
  const chunks = String(xmlText || "").split("<item>").slice(1);
  for (const chunk of chunks) {
    const title = decodeHtml((chunk.match(/<title>([\s\S]*?)<\/title>/i) || ["", ""])[1]).trim();
    const link = decodeHtml((chunk.match(/<link>([\s\S]*?)<\/link>/i) || ["", ""])[1]).trim();
    const date = decodeHtml((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || ["", ""])[1]).trim();
    if (!title || !link) continue;
    items.push({ title, link: convertGoogleNewsUrl(link), date });
    if (items.length >= limit) break;
  }
  return items;
}

function normalizeTitle(title = "") {
  return String(title).replace(/\s+/g, " ").replace(/\[[^\]]+\]/g, "").trim();
}

function dedupeRows(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = normalizeTitle(row.title).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, title: normalizeTitle(row.title) });
  }
  return out;
}

function getKstDateKey(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getHoursDiff(iso = "") {
  if (!iso) return Number.POSITIVE_INFINITY;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / (1000 * 60 * 60);
}

async function loadJsonAsset(request, pathname, fallback) {
  try {
    const target = new URL(pathname, request.url);
    const response = await fetch(target.toString(), {
      headers: { "cache-control": "no-cache" }
    });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function fetchFreshNews(name, code) {
  const q = `${name} ${code}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetch(url, {
    headers: { "User-Agent": "LuckyStock-Analyze/1.0" }
  });
  if (!response.ok) return [];
  const xml = await response.text();
  return dedupeRows(parseRss(xml, 5));
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

async function recordSearch(db, code, source = "search") {
  if (!db || !code) return;
  await ensureSearchTable(db);
  const dateKey = getKstDateKey();
  await db.prepare(
    `INSERT INTO stock_searches (search_date, code, source)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(search_date, code, source) DO UPDATE SET
       last_searched_at = CURRENT_TIMESTAMP,
       hit_count = stock_searches.hit_count + 1`
  ).bind(dateKey, code, source).run();
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
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "").trim();
  const source = String(url.searchParams.get("source") || "search").slice(0, 40);

  if (!/^\d{6}$/.test(code)) {
    return json({ error: "invalid_code" }, { status: 400 });
  }

  const [analysisPayload, newsPayload, autocompletePayload] = await Promise.all([
    loadJsonAsset(request, "/data/ui_analysis_map.json", { map: {}, generated_at: "" }),
    loadJsonAsset(request, "/data/ui_news_map.json", { map: {}, generated_at: "" }),
    loadJsonAsset(request, "/data/ui_autocomplete.json", { items: [] })
  ]);

  const analysis = analysisPayload?.map?.[code];
  if (!analysis) {
    return json({ error: "stock_not_found" }, { status: 404 });
  }

  context.waitUntil(recordSearch(env.luckystock_visitors, code, source));

  const stockMeta = Array.isArray(autocompletePayload?.items)
    ? autocompletePayload.items.find((item) => String(item?.code || "") === code) || {}
    : {};

  const cachedNews = Array.isArray(newsPayload?.map?.[code]) ? newsPayload.map[code] : [];
  const newsAgeHours = getHoursDiff(newsPayload?.generated_at || "");
  let newsItems = cachedNews;

  if (newsAgeHours >= 6 || !cachedNews.length) {
    try {
      newsItems = await fetchFreshNews(String(stockMeta?.name || analysis?.code || code), code);
    } catch {
      newsItems = cachedNews;
    }
  }

  return json({
    ...analysis,
    news_items: Array.isArray(newsItems) ? newsItems.slice(0, 5) : [],
    news_generated_at: newsPayload?.generated_at || "",
    news_live_refreshed: newsAgeHours >= 6 || !cachedNews.length
  });
}
