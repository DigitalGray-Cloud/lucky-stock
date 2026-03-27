import Database from "better-sqlite3";
import iconv from "iconv-lite";

const STOCKS_DB_PATH = "/home/user/luckstock/data/stocks.db";
const KRX_DOWNLOAD_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download";
const KRX_REFERER_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage";
const KRX_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": KRX_REFERER_URL
};

function norm(text = "") {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toMarket(text = "") {
  if (text.includes("코스닥")) return "KOSDAQ";
  if (text.includes("코넥스")) return "KONEX";
  return "KOSPI";
}

function isCode(value = "") {
  return /^\d{6}$/.test(String(value));
}

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: KRX_HEADERS
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchKrxMasterPrimary() {
  const res = await fetchWithTimeout(KRX_DOWNLOAD_URL, 12000);
  if (!res.ok) throw new Error(`KRX list error ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, "euc-kr");

  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  for (const row of rows.slice(1)) {
    const tds = row.match(/<td[\s\S]*?<\/td>/g) || [];
    if (tds.length < 3) continue;

    const name = norm(tds[0]);
    const marketRaw = norm(tds[1]);
    const code = norm(tds[2]);
    if (!isCode(code) || !name) continue;

    out.push({ code, name, market: toMarket(marketRaw), sector: null, source: "krx" });
  }

  return out;
}

function fetchKrxMasterFallbackFromSqlite() {
  const db = new Database(STOCKS_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(`
      SELECT code, name, market
      FROM stock_master
      WHERE market IN ('KOSPI', 'KOSDAQ', 'KONEX')
      ORDER BY code ASC
    `).all();

    const out = rows
      .filter((row) => isCode(row.code) && row.name)
      .map((row) => ({
        code: String(row.code),
        name: String(row.name),
        market: String(row.market || "KOSPI"),
        sector: null,
        source: "sqlite_fallback"
      }));

    if (!out.length) {
      throw new Error("sqlite fallback returned 0 rows");
    }

    return out;
  } finally {
    db.close();
  }
}

export async function fetchKrxMaster(options = {}) {
  const { allowFallback = true } = options;

  try {
    return await fetchKrxMasterPrimary();
  } catch (error) {
    if (!allowFallback) throw error;
    const fallbackRows = fetchKrxMasterFallbackFromSqlite();
    console.warn(`[krx] primary fetch failed (${error?.message || error}); using sqlite fallback rows=${fallbackRows.length}`);
    return fallbackRows;
  }
}
