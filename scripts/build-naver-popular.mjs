import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';

const ROOT = path.resolve('/home/user/luckstock');
const OUT_DIR = path.join(ROOT, 'data');
const OUT_PATH = path.join(OUT_DIR, 'ui_naver_popular.json');
const NAVER_SISE_URL = 'https://finance.naver.com/sise/';

function decodeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePopularItems(html = '') {
  const marker = 'popularItemList';
  const start = html.indexOf(marker);
  if (start < 0) return [];

  const section = html.slice(start, start + 12000);
  const chunks = section.split('<li>').slice(1);
  const items = [];

  for (const chunk of chunks) {
    const rank = Number((chunk.match(/<em>(\d+)\.<\/em>/i) || [])[1] || 0);
    const hrefMatch = chunk.match(/href=\"\/item\/main\.naver\?code=(\d{6})\"/i);
    const titleMatch = chunk.match(/<a [^>]*>([^<]+)<\/a>/i);
    const priceMatch = chunk.match(/<span class=\"(?:up|dn|nv)\">([^<]+)<\/span>/i);
    const directionMatch = chunk.match(/<span class='blind'>([^<]+)<\/span>/i);
    if (!rank || !hrefMatch || !titleMatch) continue;

    items.push({
      rank,
      code: hrefMatch[1],
      name: decodeHtml(titleMatch[1]),
      price_text: decodeHtml(priceMatch ? priceMatch[1] : ''),
      direction: decodeHtml(directionMatch ? directionMatch[1] : '변동')
    });

    if (items.length >= 10) break;
  }

  return items;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LuckyStockBot/1.0; +https://luckystock.pages.dev/)'
    }
  });
  if (!res.ok) throw new Error(`naver_popular_http_${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buffer, 'euc-kr');
}

async function main() {
  const html = await fetchHtml(NAVER_SISE_URL);
  const items = parsePopularItems(html);

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: NAVER_SISE_URL,
        items
      },
      null,
      2
    )
  );

  console.log(`[naver-popular] items=${items.length}`);
}

main().catch((err) => {
  console.error('[naver-popular] failed:', err?.message || err);
  process.exitCode = 1;
});
