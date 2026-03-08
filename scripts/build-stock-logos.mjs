import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('/home/user/luckstock');
const DB_PATH = path.join(ROOT, 'data', 'stocks.db');
const LOGO_DIR = path.join(ROOT, 'data', 'logos');

fs.mkdirSync(LOGO_DIR, { recursive: true });

const db = new Database(DB_PATH);

const cols = db.prepare('PRAGMA table_info(stock_master)').all().map((c) => c.name);
if (!cols.includes('logo_url')) db.exec('ALTER TABLE stock_master ADD COLUMN logo_url TEXT');
if (!cols.includes('logo_updated_at')) db.exec('ALTER TABLE stock_master ADD COLUMN logo_updated_at TEXT');

const stocks = db
  .prepare("SELECT code, name FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') ORDER BY code")
  .all();

function safeName(name = '') {
  return String(name).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function placeholderSvg(name, code) {
  const label = safeName(name || code);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0B1F3A"/>
      <stop offset="100%" stop-color="#144D8B"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#g)"/>
  <text x="128" y="122" text-anchor="middle" fill="#ffffff" font-size="34" font-family="Arial, sans-serif" font-weight="700">${safeName(code)}</text>
  <text x="128" y="164" text-anchor="middle" fill="#D7E8FF" font-size="20" font-family="Arial, sans-serif">${label.slice(0, 12)}</text>
</svg>`;
}

async function fetchWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LuckyStock-LogoBatch/1.0' } });
  } finally {
    clearTimeout(t);
  }
}

async function saveLogo(stock) {
  const code = String(stock.code);
  const pngPath = path.join(LOGO_DIR, `${code}.png`);
  const svgPath = path.join(LOGO_DIR, `${code}.svg`);
  const now = new Date().toISOString();

  if (fs.existsSync(pngPath)) {
    db.prepare('UPDATE stock_master SET logo_url=?, logo_updated_at=? WHERE code=?').run(`/data/logos/${code}.png`, now, code);
    return 'png_cached';
  }

  if (fs.existsSync(svgPath)) {
    db.prepare('UPDATE stock_master SET logo_url=?, logo_updated_at=? WHERE code=?').run(`/data/logos/${code}.svg`, now, code);
    return 'svg_cached';
  }

  const remote = `https://static.toss.im/png-icons/securities/icn-sec-fill-${code}.png`;
  try {
    const res = await fetchWithTimeout(remote, 7000);
    if (res.ok) {
      const ctype = String(res.headers.get('content-type') || '').toLowerCase();
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length > 100 && ctype.includes('image')) {
        fs.writeFileSync(pngPath, buf);
        db.prepare('UPDATE stock_master SET logo_url=?, logo_updated_at=? WHERE code=?').run(`/data/logos/${code}.png`, now, code);
        return 'png_downloaded';
      }
    }
  } catch {
    // fallback to svg
  }

  fs.writeFileSync(svgPath, placeholderSvg(stock.name, code), 'utf8');
  db.prepare('UPDATE stock_master SET logo_url=?, logo_updated_at=? WHERE code=?').run(`/data/logos/${code}.svg`, now, code);
  return 'svg_created';
}

async function main() {
  let pngDownloaded = 0;
  let pngCached = 0;
  let svgCreated = 0;
  let svgCached = 0;

  const concurrency = 20;
  let index = 0;

  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= stocks.length) break;
      const s = stocks[i];
      const mode = await saveLogo(s);
      if (mode === 'png_downloaded') pngDownloaded += 1;
      if (mode === 'png_cached') pngCached += 1;
      if (mode === 'svg_created') svgCreated += 1;
      if (mode === 'svg_cached') svgCached += 1;
      const done = i + 1;
      if (done % 200 === 0 || done === stocks.length) {
        console.log(`[logos] progress ${done}/${stocks.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const withLogo = db.prepare("SELECT COUNT(*) AS c FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') AND logo_url IS NOT NULL").get().c;
  console.log(`[logos] done total=${stocks.length}, with_logo=${withLogo}, png_downloaded=${pngDownloaded}, png_cached=${pngCached}, svg_created=${svgCreated}, svg_cached=${svgCached}`);
}

main()
  .catch((err) => {
    console.error('[logos] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
