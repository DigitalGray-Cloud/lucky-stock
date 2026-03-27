import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';
import { fetchKrxMaster } from './_krx.mjs';

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
if (!cols.includes('close_price'))       db.exec(`ALTER TABLE stock_master ADD COLUMN close_price INTEGER`);
if (!cols.includes('price_updated_at'))  db.exec(`ALTER TABLE stock_master ADD COLUMN price_updated_at TEXT`);
if (!cols.includes('prev_price'))        db.exec(`ALTER TABLE stock_master ADD COLUMN prev_price INTEGER`);
if (!cols.includes('change_rate'))       db.exec(`ALTER TABLE stock_master ADD COLUMN change_rate REAL`);
if (!cols.includes('volume'))            db.exec(`ALTER TABLE stock_master ADD COLUMN volume INTEGER`);
if (!cols.includes('high_price'))        db.exec(`ALTER TABLE stock_master ADD COLUMN high_price INTEGER`);
if (!cols.includes('low_price'))         db.exec(`ALTER TABLE stock_master ADD COLUMN low_price INTEGER`);

const upsert = db.prepare(`
INSERT INTO stock_master (code, name, market, close_price, prev_price, change_rate, volume, high_price, low_price, source, updated_at, price_updated_at)
VALUES (@code, @name, @market, @close_price, @prev_price, @change_rate, @volume, @high_price, @low_price, @source, @updated_at, @price_updated_at)
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,
  market=excluded.market,
  close_price=COALESCE(excluded.close_price, stock_master.close_price),
  prev_price=COALESCE(excluded.prev_price, stock_master.prev_price),
  change_rate=COALESCE(excluded.change_rate, stock_master.change_rate),
  volume=COALESCE(excluded.volume, stock_master.volume),
  high_price=COALESCE(excluded.high_price, stock_master.high_price),
  low_price=COALESCE(excluded.low_price, stock_master.low_price),
  source=excluded.source,
  updated_at=excluded.updated_at,
  price_updated_at=COALESCE(excluded.price_updated_at, stock_master.price_updated_at)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) upsert.run(row);
});

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

// 단일 종목 전체 시장 데이터 반환 (현재가, 전일가, 등락률, 거래량, 고가, 저가)
async function fetchNaverRealtimeData(code) {
  const query = `SERVICE_ITEM:${code}`;
  const url = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const areas = Array.isArray(data?.result?.areas) ? data.result.areas : [];
  const svc = areas.find((x) => x?.name === 'SERVICE_ITEM');
  const rows = Array.isArray(svc?.datas) ? svc.datas : [];
  const item = rows.find((r) => String(r?.cd || '').trim() === code) || rows[0];
  if (!item) return null;
  const nv = Number(item?.nv);
  if (!Number.isFinite(nv) || nv <= 0) return null;
  return {
    close_price:  Math.round(nv),
    prev_price:   Number.isFinite(Number(item?.sv)) ? Math.round(Number(item.sv)) : null,
    change_rate:  Number.isFinite(Number(item?.cr)) ? Number(item.cr) : null,
    volume:       Number.isFinite(Number(item?.aq)) && Number(item.aq) > 0 ? Math.round(Number(item.aq)) : null,
    high_price:   Number.isFinite(Number(item?.hv)) ? Math.round(Number(item.hv)) : null,
    low_price:    Number.isFinite(Number(item?.lv)) ? Math.round(Number(item.lv)) : null,
  };
}

// HTML fallback - 현재가만 추출 (polling API 실패 시)
async function fetchNaverMainPagePrice(code) {
  const url = `https://finance.naver.com/item/main.naver?code=${code}`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, 'euc-kr');

  const m1 = html.match(/<p class="no_today">[\s\S]*?<span class="blind">([^<]+)<\/span>/i);
  const p1 = parseNumber(m1?.[1] || '');
  if (p1 && p1 > 0) return { close_price: Math.round(p1), prev_price: null, change_rate: null, volume: null, high_price: null, low_price: null };

  const m2 = html.match(/<em class="no_up">\s*<span class="blind">([^<]+)<\/span>|<em class="no_down">\s*<span class="blind">([^<]+)<\/span>|<em class="no_quot">\s*<span class="blind">([^<]+)<\/span>/i);
  const p2 = parseNumber((m2?.[1] || m2?.[2] || m2?.[3] || ''));
  if (p2 && p2 > 0) return { close_price: Math.round(p2), prev_price: null, change_rate: null, volume: null, high_price: null, low_price: null };

  return null;
}

async function fetchDataForCode(code) {
  const first = await fetchNaverRealtimeData(code).catch(() => null);
  if (first) return first;
  const fallback = await fetchNaverMainPagePrice(code).catch(() => null);
  return fallback;
}

async function fetchAllData(codes) {
  const results = new Map();
  const concurrency = 60;  // 18→60 (약 3배 속도)
  let idx = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= codes.length) break;

      const code = codes[current];
      const d = await fetchDataForCode(code);
      if (d && d.close_price > 0) results.set(code, d);

      done += 1;
      if (done % 200 === 0 || done === codes.length) {
        console.log(`[batch] price progress ${done}/${codes.length}, priced=${results.size}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // 실패 종목 1회 재시도 (concurrency 낮춰서 안정적으로)
  const missing = codes.filter((c) => !results.has(c));
  if (missing.length > 0) {
    console.log(`[batch] retrying ${missing.length} failed codes...`);
    let ridx = 0;
    async function retryWorker() {
      while (true) {
        const ci = ridx++;
        if (ci >= missing.length) break;
        const code = missing[ci];
        const d = await fetchDataForCode(code);
        if (d && d.close_price > 0) results.set(code, d);
      }
    }
    await Promise.all(Array.from({ length: 20 }, () => retryWorker()));
    console.log(`[batch] retry done, total priced=${results.size}`);
  }

  return results;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log('[batch] fetching KRX master...');
  const master = await fetchKrxMaster();
  console.log(`[batch] krx rows=${master.length}`);

  const codes = master
    .filter((x) => x.market === 'KOSPI' || x.market === 'KOSDAQ')
    .map((x) => x.code);

  console.log('[batch] fetching Naver prices per code (concurrency=60)...');
  const t0 = Date.now();
  const marketData = await fetchAllData(codes);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const now = new Date().toISOString();
  const rows = master
    .filter((x) => x.market === 'KOSPI' || x.market === 'KOSDAQ')
    .map((x) => {
      const d = marketData.get(x.code);
      return {
        code: x.code,
        name: x.name,
        market: x.market,
        close_price:  d?.close_price  ?? null,
        prev_price:   d?.prev_price   ?? null,
        change_rate:  d?.change_rate  ?? null,
        volume:       d?.volume       ?? null,
        high_price:   d?.high_price   ?? null,
        low_price:    d?.low_price    ?? null,
        source: 'krx+naver',
        updated_at: now,
        price_updated_at: d ? now : null
      };
    });

  insertMany(rows);

  const total  = db.prepare("SELECT COUNT(*) AS cnt FROM stock_master WHERE market IN ('KOSPI','KOSDAQ')").get().cnt;
  const priced = db.prepare("SELECT COUNT(*) AS cnt FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') AND close_price IS NOT NULL").get().cnt;
  const kospi  = db.prepare("SELECT COUNT(*) AS cnt FROM stock_master WHERE market='KOSPI'").get().cnt;
  const kosdaq = db.prepare("SELECT COUNT(*) AS cnt FROM stock_master WHERE market='KOSDAQ'").get().cnt;
  console.log(`[batch] done elapsed=${elapsed}s upserted=${rows.length}, priced=${priced}/${total}, kospi=${kospi}, kosdaq=${kosdaq}`);
}

main()
  .catch((err) => {
    console.error('[batch] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
