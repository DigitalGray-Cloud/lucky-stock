import iconv from "iconv-lite";

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
      headers: { "User-Agent": "LuckyStock-Batch/2.0" }
    });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchKrxMaster() {
  const url = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download";
  const res = await fetchWithTimeout(url, 12000);
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

    out.push({ code, name, market: toMarket(marketRaw), sector: null });
  }

  return out;
}
