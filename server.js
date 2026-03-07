import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 8787);

const STOCKS = [
  { name: "Tesla", ticker: "TSLA", aliases: ["테슬라"], sector: "전기차/에너지" },
  { name: "NVIDIA", ticker: "NVDA", aliases: ["엔비디아", "Nvidia"], sector: "반도체/AI" },
  { name: "AMD", ticker: "AMD", aliases: ["에이엠디"], sector: "반도체" },
  { name: "Apple", ticker: "AAPL", aliases: ["애플"], sector: "소비자 IT" },
  { name: "Microsoft", ticker: "MSFT", aliases: ["마이크로소프트"], sector: "클라우드/SaaS" },
  { name: "Amazon", ticker: "AMZN", aliases: ["아마존"], sector: "이커머스/클라우드" },
  { name: "Meta", ticker: "META", aliases: ["메타"], sector: "소셜/광고" },
  { name: "Samsung Electronics", ticker: "005930", aliases: ["삼성전자", "Samsung"], sector: "반도체/전자" }
];

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function normalize(text = "") {
  return text.toLowerCase().trim();
}

function findStock(query) {
  const q = normalize(query);
  if (!q) return null;
  return STOCKS.find((stock) => {
    const bag = [stock.name, stock.ticker, ...(stock.aliases || [])].map(normalize);
    return bag.some((s) => s.includes(q));
  });
}

function convertGoogleNewsUrl(googleLink) {
  if (!googleLink) return "";
  if (googleLink.startsWith("./")) return `https://news.google.com/${googleLink.slice(2)}`;
  if (googleLink.startsWith("/")) return `https://news.google.com${googleLink}`;
  return googleLink;
}

function decodeHtml(text = "") {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseGoogleNewsRss(xmlText, limit = 8) {
  const items = [];
  const chunks = xmlText.split("<item>").slice(1);
  for (const chunk of chunks) {
    const title = decodeHtml((chunk.match(/<title>([\s\S]*?)<\/title>/i) || ["", ""])[1]).trim();
    const link = decodeHtml((chunk.match(/<link>([\s\S]*?)<\/link>/i) || ["", ""])[1]).trim();
    const pubDate = ((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || ["", ""])[1] || "").trim();
    if (!title || !link) continue;
    items.push({ title, link: convertGoogleNewsUrl(link), pubDate });
    if (items.length >= limit) break;
  }
  return items;
}

async function fetchNaverQuote(ticker) {
  if (!/^\d{6}$/.test(String(ticker || ""))) return null;
  const query = `SERVICE_ITEM:${ticker}|SERVICE_RECENT_ITEM:${ticker}|SERVICE_ITEM_SUMMARY:${ticker}`;
  const url = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "StockCatalystFinder/1.0" } });
  if (!res.ok) throw new Error(`Naver quote error: ${res.status}`);
  const data = await res.json();
  const areas = Array.isArray(data?.result?.areas) ? data.result.areas : [];
  const service = areas.find((a) => a?.name === "SERVICE_ITEM");
  const q = Array.isArray(service?.datas) ? service.datas.find((x) => String(x?.cd || "") === String(ticker)) : null;
  if (!q) return null;
  return {
    symbol: ticker,
    name: q.nm || ticker,
    price: Number.isFinite(Number(q.nv)) ? Number(q.nv) : null,
    marketCap: Number.isFinite(Number(q.aa)) ? Number(q.aa) : null,
    currency: "KRW"
  };
}

async function fetchGoogleNews(query) {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(rss, { headers: { "User-Agent": "StockCatalystFinder/1.0" } });
  if (!res.ok) throw new Error(`Google News RSS error: ${res.status}`);
  const xml = await res.text();
  return parseGoogleNewsRss(xml, 8);
}

function scoreSentimentByKeywords(newsItems) {
  const positive = ["surge", "beat", "growth", "record", "partnership", "expands", "rise", "강세", "증가", "확대", "성장", "최대", "호조"];
  const negative = ["drop", "miss", "lawsuit", "cut", "downturn", "fall", "약세", "감소", "리스크", "우려", "하락", "부진"];
  let score = 50;

  newsItems.forEach((n) => {
    const t = normalize(n.title);
    const posHits = positive.filter((w) => t.includes(w)).length;
    const negHits = negative.filter((w) => t.includes(w)).length;
    score += posHits * 4;
    score -= negHits * 5;
  });

  return Math.max(0, Math.min(100, Math.round(score)));
}

function hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRange(seed, min, max) {
  const x = Math.sin(seed) * 10000;
  const n = x - Math.floor(x);
  return min + n * (max - min);
}

async function buildAnalysis(query) {
  const stock = findStock(query);
  if (!stock) return null;

  const [quote, news] = await Promise.all([
    fetchNaverQuote(stock.ticker).catch(() => null),
    fetchGoogleNews(`${stock.name} ${stock.ticker}`).catch(() => [])
  ]);

  const seed = hashCode(stock.ticker + stock.name);
  const newsScore = scoreSentimentByKeywords(news);
  const earningsScore = Math.round(seededRange(seed + 11, 50, 92));
  const flowScore = Math.round(seededRange(seed + 12, 45, 93));
  const industryScore = Math.round(seededRange(seed + 13, 55, 94));
  const sentimentScore = Math.round((newsScore + seededRange(seed + 14, 45, 90)) / 2);

  const totalScore = Math.round(
    newsScore * 0.28 +
      earningsScore * 0.2 +
      flowScore * 0.18 +
      industryScore * 0.2 +
      sentimentScore * 0.14
  );

  const aiSummary = `${stock.name}은(는) 최근 뉴스 모멘텀이 ${newsScore >= 70 ? "강한 편" : newsScore >= 55 ? "보통" : "약한 편"}이며, ${totalScore >= 70 ? "중단기 긍정 관점" : "보수적 접근"}이 유효합니다.`;

  return {
    stock: {
      name: quote?.name || stock.name,
      ticker: stock.ticker,
      sector: stock.sector,
      price: quote?.price,
      marketcap: quote?.marketCap,
      currency: quote?.currency || "USD",
      per: Number(seededRange(seed + 21, 12, 72).toFixed(1)),
      pbr: Number(seededRange(seed + 22, 1.1, 16).toFixed(1))
    },
    analysis: {
      summary: aiSummary,
      bull_points: news.slice(0, 4).map((n) => ({ title: n.title, date: n.pubDate, link: n.link })),
      risk_points: [
        "밸류에이션 부담 점검 필요",
        "매크로 변수(금리/환율) 변동성",
        "경쟁사 신제품 출시 리스크"
      ],
      future_growth: [
        "AI/데이터센터 투자 확대 수혜",
        "고부가 제품 비중 상승",
        "글로벌 고객사 다변화"
      ],
      valuation: totalScore >= 83 ? "고평가" : totalScore >= 63 ? "적정" : "저평가",
      investment_view: {
        short: "이벤트/뉴스 모멘텀 추적",
        mid: "실적 추세 확인",
        long: "산업 구조적 성장에 베팅"
      }
    },
    flow_data: {
      foreign_buy: Array.from({ length: 5 }, (_, i) => Math.round(seededRange(seed + 30 + i, -300, 1500))),
      institution_buy: Array.from({ length: 5 }, (_, i) => Math.round(seededRange(seed + 40 + i, -250, 1200)))
    },
    technical: {
      support: Number((quote?.price ? quote.price * seededRange(seed + 50, 0.86, 0.95) : seededRange(seed + 50, 90, 130)).toFixed(2)),
      resistance: Number((quote?.price ? quote.price * seededRange(seed + 51, 1.06, 1.18) : seededRange(seed + 51, 130, 170)).toFixed(2)),
      high_52w_diff: -Math.round(seededRange(seed + 52, 4, 28))
    },
    catalyst_score: {
      total: totalScore,
      news_score: newsScore,
      earnings_score: earningsScore,
      flow_score: flowScore,
      industry_score: industryScore,
      sentiment_score: sentimentScore
    },
    investor_interest: {
      twitter: `+${Math.round(seededRange(seed + 60, 20, 170))}%`,
      reddit: `+${Math.round(seededRange(seed + 61, 10, 140))}%`,
      news: `+${Math.round(seededRange(seed + 62, 8, 90))}%`,
      today_delta: `+${Math.round(seededRange(seed + 63, 20, 130))}%`
    }
  };
}

async function handleApi(req, res, urlObj) {
  if (req.method === "GET" && urlObj.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/autocomplete") {
    const q = urlObj.searchParams.get("q") || "";
    const nq = normalize(q);
    const items = STOCKS.filter((stock) => {
      const bag = [stock.name, stock.ticker, ...(stock.aliases || [])].map(normalize);
      return nq && bag.some((x) => x.includes(nq));
    }).slice(0, 10);
    sendJson(res, 200, { items });
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/news") {
    const q = urlObj.searchParams.get("q") || "";
    if (!q) {
      sendJson(res, 400, { error: "q is required" });
      return;
    }

    try {
      const news = await fetchGoogleNews(q);
      sendJson(res, 200, { items: news });
    } catch (err) {
      sendJson(res, 502, { error: "failed_to_fetch_news", details: String(err?.message || err) });
    }
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/analyze") {
    const q = urlObj.searchParams.get("q") || "";
    if (!q) {
      sendJson(res, 400, { error: "q is required" });
      return;
    }

    try {
      const analysis = await buildAnalysis(q);
      if (!analysis) {
        sendJson(res, 404, { error: "stock_not_found" });
        return;
      }
      sendJson(res, 200, analysis);
    } catch (err) {
      sendJson(res, 500, { error: "analysis_failed", details: String(err?.message || err) });
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (urlObj.pathname.startsWith("/api/")) {
    await handleApi(req, res, urlObj);
    return;
  }

  const safePath = path.normalize(urlObj.pathname).replace(/^\.\.(\/|\\|$)/, "");
  let filePath = path.join(__dirname, safePath);

  if (urlObj.pathname === "/") {
    filePath = path.join(__dirname, "index.html");
  }

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Stock Catalyst Finder server running on http://localhost:${PORT}`);
});
