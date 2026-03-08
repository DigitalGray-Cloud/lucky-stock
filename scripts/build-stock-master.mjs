import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';

const ROOT = path.resolve('/home/user/luckstock');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'stocks.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS stock_master (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  close_price INTEGER,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  price_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stock_master_name ON stock_master(name);
`);

const cols = db.prepare(`PRAGMA table_info(stock_master)`).all().map((c) => c.name);
if (!cols.includes('close_price')) db.exec(`ALTER TABLE stock_master ADD COLUMN close_price INTEGER`);
if (!cols.includes('price_updated_at')) db.exec(`ALTER TABLE stock_master ADD COLUMN price_updated_at TEXT`);

const upsert = db.prepare(`
INSERT INTO stock_master (code, name, market, close_price, source, updated_at, price_updated_at)
VALUES (@code, @name, @market, @close_price, @source, @updated_at, @price_updated_at)
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,
  market=excluded.market,
  close_price=COALESCE(excluded.close_price, stock_master.close_price),
  source=excluded.source,
  updated_at=excluded.updated_at,
  price_updated_at=COALESCE(excluded.price_updated_at, stock_master.price_updated_at)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) upsert.run(row);
});

function norm(text = '') {
  return String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function isCode(code = '') {
  return /^\d{6}$/.test(String(code));
}

function toMarket(text = '') {
  const t = String(text);
  if (t.includes('코스닥')) return 'KOSDAQ';
  if (t.includes('코넥스')) return 'KONEX';
  return 'KOSPI';
}

function parseNumber(text = '') {
  const n = Number(String(text).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LuckyStock-Batch/1.1' } });
  } finally {
    clearTimeout(t);
  }
}

async function fetchKrxMaster() {
  const url = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download';
  const res = await fetchWithTimeout(url, 12000);
  if (!res.ok) throw new Error(`KRX list error ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, 'euc-kr');

  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  for (const row of rows.slice(1)) {
    const tds = row.match(/<td[\s\S]*?<\/td>/g) || [];
    if (tds.length < 3) continue;
    const name = norm(tds[0]);
    const marketRaw = norm(tds[1]);
    const code = norm(tds[2]);
    if (!name || !isCode(code)) continue;
    out.push({ code, name, market: toMarket(marketRaw) });
  }
  return out;
}

async function fetchNaverRealtimePrice(code) {
  const query = `SERVICE_ITEM:${code}`;
  const url = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, 9000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const areas = Array.isArray(data?.result?.areas) ? data.result.areas : [];
  const svc = areas.find((x) => x?.name === 'SERVICE_ITEM');
  const rows = Array.isArray(svc?.datas) ? svc.datas : [];
  const item = rows.find((r) => String(r?.cd || '').trim() === code) || rows[0];
  const nv = Number(item?.nv);
  return Number.isFinite(nv) && nv > 0 ? Math.round(nv) : null;
}

async function fetchNaverMainPagePrice(code) {
  const url = `https://finance.naver.com/item/main.naver?code=${code}`;
  const res = await fetchWithTimeout(url, 9000);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, 'euc-kr');

  const m1 = html.match(/<p class="no_today">[\s\S]*?<span class="blind">([^<]+)<\/span>/i);
  const p1 = parseNumber(m1?.[1] || '');
  if (p1 && p1 > 0) return Math.round(p1);

  const m2 = html.match(/<em class="no_up">\s*<span class="blind">([^<]+)<\/span>|<em class="no_down">\s*<span class="blind">([^<]+)<\/span>|<em class="no_quot">\s*<span class="blind">([^<]+)<\/span>/i);
  const p2 = parseNumber((m2?.[1] || m2?.[2] || m2?.[3] || ''));
  if (p2 && p2 > 0) return Math.round(p2);

  return null;
}

async function fetchPriceForCode(code) {
  const first = await fetchNaverRealtimePrice(code).catch(() => null);
  if (first) return first;
  const fallback = await fetchNaverMainPagePrice(code).catch(() => null);
  if (fallback) return fallback;
  return null;
}

async function fetchAllPrices(codes) {
  const prices = new Map();
  const concurrency = 18;
  let idx = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= codes.length) break;

      const code = codes[current];
      const p = await fetchPriceForCode(code);
      if (p && p > 0) prices.set(code, p);

      done += 1;
      if (done % 120 === 0 || done === codes.length) {
        console.log(`[batch] price progress ${done}/${codes.length}, priced=${prices.size}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (prices.size < codes.length) {
    const missing = codes.filter((c) => !prices.has(c));
    for (let i = 0; i < missing.length; i += 1) {
      const code = missing[i];
      const p = await fetchPriceForCode(code);
      if (p && p > 0) prices.set(code, p);
      if ((i + 1) % 200 === 0 || i + 1 === missing.length) {
        console.log(`[batch] retry progress ${i + 1}/${missing.length}, priced=${prices.size}`);
      }
    }
  }

  return prices;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log('[batch] fetching KRX master...');
  const master = await fetchKrxMaster();
  console.log(`[batch] krx rows=${master.length}`);

  const codes = master
    .filter((x) => x.market === 'KOSPI' || x.market === 'KOSDAQ')
    .map((x) => x.code);

  console.log('[batch] fetching Naver prices per code...');
  const prices = await fetchAllPrices(codes);

  const now = new Date().toISOString();
  const rows = master
    .filter((x) => x.market === 'KOSPI' || x.market === 'KOSDAQ')
    .map((x) => ({
      code: x.code,
      name: x.name,
      market: x.market,
      close_price: prices.get(x.code) ?? null,
      source: 'krx+naver',
      updated_at: now,
      price_updated_at: prices.has(x.code) ? now : null
    }));

  insertMany(rows);

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM stock_master WHERE market IN (\'KOSPI\',\'KOSDAQ\')').get().cnt;
  const priced = db.prepare('SELECT COUNT(*) AS cnt FROM stock_master WHERE market IN (\'KOSPI\',\'KOSDAQ\') AND close_price IS NOT NULL').get().cnt;
  const kospi = db.prepare("SELECT COUNT(*) AS cnt FROM stock_master WHERE market='KOSPI'").get().cnt;
  const kosdaq = db.prepare("SELECT COUNT(*) AS cnt FROM stock_master WHERE market='KOSDAQ'").get().cnt;
  console.log(`[batch] done upserted=${rows.length}, priced=${priced}, db_total=${total}, kospi=${kospi}, kosdaq=${kosdaq}`);
}

main()
  .catch((err) => {
    console.error('[batch] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
