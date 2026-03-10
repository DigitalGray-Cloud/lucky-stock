import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';

const ROOT = path.resolve('/home/user/luckstock');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'stocks.db');
const OUT_PATH = path.join(DATA_DIR, 'ui_news_map.json');

function decodeHtml(text = '') {
  return String(text)
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function convertGoogleNewsUrl(link) {
  if (!link) return '';
  if (link.startsWith('./')) return `https://news.google.com/${link.slice(2)}`;
  if (link.startsWith('/')) return `https://news.google.com${link}`;
  return link;
}

function parseRss(xmlText, limit = 5) {
  const out = [];
  const chunks = String(xmlText || '').split('<item>').slice(1);
  for (const chunk of chunks) {
    const title = decodeHtml((chunk.match(/<title>([\s\S]*?)<\/title>/i) || ['', ''])[1]);
    const link = decodeHtml((chunk.match(/<link>([\s\S]*?)<\/link>/i) || ['', ''])[1]);
    const pubDate = decodeHtml((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || ['', ''])[1]);
    if (!title || !link) continue;
    out.push({ title, link: convertGoogleNewsUrl(link), date: pubDate });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LuckyStock-NewsBatch/1.0' } });
  } finally {
    clearTimeout(t);
  }
}

async function fetchNews(name, code) {
  const q = `${name} ${code}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetchWithTimeout(url, 10000);
  if (!res.ok) return [];

  const buf = Buffer.from(await res.arrayBuffer());
  const text = iconv.decode(buf, 'utf-8');
  return parseRss(text, 5);
}

function normalizeTitle(title = '') {
  return String(title)
    .replace(/\s+/g, ' ')
    .replace(/\[[^\]]+\]/g, '')
    .trim();
}

function dedupeRows(rows) {
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

function loadTargets() {
  if (!fs.existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return db
      .prepare("SELECT code, name FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') ORDER BY code")
      .all()
      .map((x) => ({ code: String(x.code || ''), name: String(x.name || x.code || '') }))
      .filter((x) => x.code && x.name);
  } finally {
    db.close();
  }
}

async function main() {
  const targets = loadTargets();
  const map = {};

  if (!targets.length) {
    fs.writeFileSync(OUT_PATH, JSON.stringify({ generated_at: new Date().toISOString(), map }, null, 2));
    console.log('[news] no targets; wrote empty map');
    return;
  }

  let index = 0;
  const concurrency = 8;

  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= targets.length) break;
      const t = targets[i];
      const rows = await fetchNews(t.name, t.code).catch(() => []);
      map[t.code] = dedupeRows(rows);
      if ((i + 1) % 50 === 0 || i + 1 === targets.length) {
        console.log(`[news] progress ${i + 1}/${targets.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify({ generated_at: new Date().toISOString(), size: Object.keys(map).length, map }, null, 2)
  );

  console.log(`[news] done targets=${targets.length}, mapped=${Object.keys(map).length}`);
}

main().catch((err) => {
  console.error('[news] failed:', err?.message || err);
  process.exitCode = 1;
});
