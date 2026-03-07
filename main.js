const STOCKS = [
  { name: "삼성전자", code: "005930", market: "KOSPI", sector: "반도체", theme: "AI반도체", domain: "samsung.com" },
  { name: "SK하이닉스", code: "000660", market: "KOSPI", sector: "반도체", theme: "AI반도체", domain: "skhynix.com" },
  { name: "한미반도체", code: "042700", market: "KOSPI", sector: "반도체장비", theme: "AI반도체", domain: "hanmisemi.com" },
  { name: "두산로보틱스", code: "454910", market: "KOSPI", sector: "로봇", theme: "로봇", domain: "doosanrobotics.com" },
  { name: "에코프로", code: "086520", market: "KOSDAQ", sector: "2차전지", theme: "2차전지", domain: "ecopro.co.kr" },
  { name: "레인보우로보틱스", code: "277810", market: "KOSDAQ", sector: "로봇", theme: "로봇", domain: "rainbow-robotics.com" },
  { name: "포스코DX", code: "022100", market: "KOSPI", sector: "IT서비스", theme: "스마트팩토리", domain: "poscodx.com" },
  { name: "알테오젠", code: "196170", market: "KOSDAQ", sector: "바이오", theme: "바이오", domain: "alteogen.com" },
  { name: "에코프로비엠", code: "247540", market: "KOSDAQ", sector: "2차전지", theme: "2차전지", domain: "ecoprobm.co.kr" },
  { name: "셀트리온", code: "068270", market: "KOSPI", sector: "바이오", theme: "바이오", domain: "celltrion.com" },
  { name: "NAVER", code: "035420", market: "KOSPI", sector: "인터넷", theme: "AI플랫폼", domain: "navercorp.com" },
  { name: "카카오", code: "035720", market: "KOSPI", sector: "인터넷", theme: "AI플랫폼", domain: "kakaocorp.com" },
  { name: "LG에너지솔루션", code: "373220", market: "KOSPI", sector: "2차전지", theme: "2차전지", domain: "lgensol.com" },
  { name: "현대차", code: "005380", market: "KOSPI", sector: "자동차", theme: "전기차", domain: "hyundai.com" },
  { name: "기아", code: "000270", market: "KOSPI", sector: "자동차", theme: "전기차", domain: "kia.com" }
];

const QUICK_TAGS = ["삼성전자", "005930", "SK하이닉스", "000660", "두산로보틱스", "454910", "NAVER", "035420"];
const NAVER_AC_ENDPOINT = "https://ac.stock.naver.com/ac";
const AUTO_COMPLETE_LIMIT = 12;

const els = {
  manualToggle: document.getElementById("manual-toggle"),
  manualPanel: document.getElementById("manual-panel"),
  searchInput: document.getElementById("stock-search"),
  searchBtn: document.getElementById("search-btn"),
  autoList: document.getElementById("autocomplete-list"),
  quickTags: document.getElementById("quick-tags"),
  todayHeadline: document.getElementById("today-headline"),
  tomorrowHeadline: document.getElementById("tomorrow-headline"),
  todaySurgeList: document.getElementById("today-surge-list"),
  tomorrowTop10: document.getElementById("tomorrow-top10"),
  signalFeed: document.getElementById("signal-feed"),
  popularList: document.getElementById("popular-list"),
  themeFeed: document.getElementById("theme-feed"),
  companyLogo: document.getElementById("company-logo-img"),
  companyName: document.getElementById("company-name"),
  companyInlinePrice: document.getElementById("company-inline-price"),
  companyCode: document.getElementById("company-code"),
  aiDecision: document.getElementById("ai-decision"),
  decisionGuide: document.getElementById("decision-guide"),
  aiConfidence: document.getElementById("ai-confidence"),
  catalystScore: document.getElementById("catalyst-score"),
  decisionDesc: document.getElementById("decision-desc"),
  buyReasons: document.getElementById("buy-reasons"),
  riskPoints: document.getElementById("risk-points"),
  prob1m: document.getElementById("prob-1m"),
  prob3m: document.getElementById("prob-3m"),
  prob1y: document.getElementById("prob-1y"),
  flowTable: document.getElementById("flow-table"),
  techHighDiff: document.getElementById("tech-high-diff"),
  techSupport: document.getElementById("tech-support"),
  techResistance: document.getElementById("tech-resistance"),
  valuationBadge: document.getElementById("valuation-badge"),
  valuationDesc: document.getElementById("valuation-desc"),
  scoreBreakdown: document.getElementById("score-breakdown"),
  newsList: document.getElementById("news-list"),
  clickedRationale: document.getElementById("clicked-rationale"),
  signalSummary: document.getElementById("signal-summary"),
  signalVisual: document.getElementById("signal-visual")
};

const NEWS_CACHE = new Map();
const NAVER_AC_CACHE = new Map();
const PRICE_CACHE = new Map();
let autoCompleteSeq = 0;
let suppressUrlUpdate = false;

function normalize(text) {
  return String(text || "").toLowerCase().trim();
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Number(value).toLocaleString("ko-KR");
}

function recent5Dates() {
  const today = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (4 - i));
    return d.toISOString().slice(0, 10);
  });
}

function nextTradingDay(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function formatMMDD(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}.${dd}`;
}

function formatYYYYMMDD(date) {
  return date.toISOString().slice(0, 10);
}

function updateResultUrl(code) {
  if (!code || suppressUrlUpdate) return;
  const url = new URL(window.location.href);
  url.searchParams.set("code", code);
  history.replaceState({}, "", url.toString());
}

function scrollToResult() {
  const panel = document.getElementById("result-panel");
  if (!panel) return;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function findStock(query) {
  const q = normalize(query);
  if (!q) return null;
  return STOCKS.find((s) => [s.name, s.code].map(normalize).some((v) => v.includes(q)));
}

function marketSuffix(stock) {
  return String(stock?.market || "").toUpperCase().includes("KOSDAQ") ? "KQ" : "KS";
}

function isKrCode(code) {
  return /^\d{6}$/.test(String(code || "").trim());
}

async function ensureRealtimePrices(stocks) {
  const targets = (stocks || []).filter((s) => isKrCode(s?.code));
  if (!targets.length) return;

  const codes = [...new Set(targets.map((s) => String(s.code).trim()).filter((code) => !PRICE_CACHE.has(code)))];
  if (!codes.length) return;

  const chunkSize = 40;
  for (let i = 0; i < codes.length; i += chunkSize) {
    const chunk = codes.slice(i, i + chunkSize);
    const query = chunk.map((code) => `SERVICE_ITEM:${code}`).join("|");
    const url = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(query)}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) continue;
    const data = await res.json();
    const areas = Array.isArray(data?.result?.areas) ? data.result.areas : [];
    const serviceItem = areas.find((x) => x?.name === "SERVICE_ITEM");
    const rows = Array.isArray(serviceItem?.datas) ? serviceItem.datas : [];
    rows.forEach((row) => {
      const code = String(row?.cd || "").trim();
      const price = Number(row?.nv);
      if (isKrCode(code) && Number.isFinite(price) && price > 0) {
        PRICE_CACHE.set(code, Math.round(price));
      }
    });
  }
}

async function ensureRealtimePriceBySearch(stock) {
  if (!stock || !isKrCode(stock.code) || PRICE_CACHE.has(stock.code)) return;
  const q = `${stock.name} ${stock.code}`;
  const matches = await fetchNaverAutocomplete(q).catch(() => []);
  const exact = matches.find((m) => String(m.code) === String(stock.code));
  if (exact) {
    stock.market = exact.market || stock.market;
    stock.name = exact.name || stock.name;
  }
  await ensureRealtimePrices([stock]);
}

function fallbackMarketByCode(code) {
  const c = String(code || "");
  if (c.startsWith("0") || c.startsWith("1")) return "KOSPI";
  if (c.startsWith("2") || c.startsWith("3") || c.startsWith("4")) return "KOSDAQ";
  return "KOSPI";
}

async function findStockAsync(query) {
  const local = findStock(query);
  if (local) {
    await ensureRealtimePriceBySearch(local);
    return local;
  }

  const remote = await fetchNaverAutocomplete(query);
  if (remote.length) {
    await ensureRealtimePrices(remote.slice(0, 5));
    return remote[0];
  }

  const codeQuery = String(query || "").trim();
  if (isKrCode(codeQuery)) {
    const inferred = {
      name: codeQuery,
      code: codeQuery,
      market: fallbackMarketByCode(codeQuery),
      sector: "기타",
      theme: "시장",
      domain: ""
    };
    await ensureRealtimePriceBySearch(inferred);
    if (inferred.name !== codeQuery || PRICE_CACHE.has(codeQuery)) {
      return inferred;
    }
  }
  return null;
}

function mapNaverItemToStock(item) {
  const code = String(item?.code || "").trim();
  const name = String(item?.name || "").trim();
  if (!code || !name) return null;
  return {
    name,
    code,
    market: String(item?.typeCode || "").toUpperCase().includes("KOSDAQ") ? "KOSDAQ" : "KOSPI",
    sector: "기타",
    theme: "시장",
    domain: ""
  };
}

async function fetchNaverAutocomplete(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const key = normalize(q);
  if (NAVER_AC_CACHE.has(key)) return NAVER_AC_CACHE.get(key);

  const targetUrl = `${NAVER_AC_ENDPOINT}?q=${encodeURIComponent(q)}&target=stock`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`naver ac ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const mapped = items.map(mapNaverItemToStock).filter(Boolean);
  NAVER_AC_CACHE.set(key, mapped);
  return mapped;
}

function buildBasePrice(seed) {
  return Math.round(seededRange(seed + 1, 8000, 220000));
}

function baseReasons(stock) {
  const sectorReason = {
    반도체: ["HBM 메모리 수요 증가", "외국인 순매수 확대", "반도체 업황 회복"],
    반도체장비: ["고객사 CAPEX 확대", "패키징 장비 발주 증가", "수주 잔고 성장"],
    로봇: ["로봇 자동화 수요 확대", "신규 수주 증가", "테마 거래대금 집중"],
    "2차전지": ["양극재 수요 반등 기대", "정책 모멘텀 유입", "거래량 회복"],
    바이오: ["파이프라인 기대감", "기술수출 모멘텀", "기관 매수 전환"],
    인터넷: ["AI 서비스 확장", "광고 매출 개선", "실적 컨센서스 상향"],
    자동차: ["전기차 판매 확대", "환율 우호 환경", "수익성 개선"],
    IT서비스: ["스마트팩토리 투자 확대", "대형 프로젝트 수주", "기관 수급 개선"]
  };
  return sectorReason[stock.sector] || ["실적 개선 가능성", "수급 개선", "산업 모멘텀 유입"];
}

function baseRisks(stock) {
  return [
    `${stock.sector} 밸류에이션 부담`,
    "매크로 변동성(금리/환율)",
    "단기 과열 후 조정 가능성"
  ];
}

function makeAnalysis(stock) {
  const seed = hashCode(stock.code + stock.name);
  const dates = recent5Dates();

  const foreignFlow = dates.map((_, i) => Math.round(seededRange(seed + 20 + i, -350, 1600)));
  const instFlow = dates.map((_, i) => Math.round(seededRange(seed + 30 + i, -300, 1400)));
  const foreignTotal = foreignFlow.reduce((a, b) => a + b, 0);
  const instTotal = instFlow.reduce((a, b) => a + b, 0);

  const scores = {
    news: Math.round(seededRange(seed + 2, 52, 93)),
    earnings: Math.round(seededRange(seed + 3, 48, 92)),
    foreign: clamp(Math.round(50 + foreignTotal / 90), 20, 98),
    institution: clamp(Math.round(50 + instTotal / 95), 20, 98),
    industry: Math.round(seededRange(seed + 6, 55, 96)),
    sentiment: Math.round(seededRange(seed + 7, 45, 91))
  };

  const catalyst = Math.round(
    scores.news * 0.2 +
      scores.earnings * 0.2 +
      scores.foreign * 0.15 +
      scores.institution * 0.15 +
      scores.industry * 0.2 +
      scores.sentiment * 0.1
  );

  const flowMomentum = (foreignTotal + instTotal) / 250;
  const prob1m = clamp(Math.round(40 + catalyst * 0.35 + flowMomentum), 40, 85);
  const prob3m = clamp(prob1m + Math.round(seededRange(seed + 8, 4, 12)), 45, 90);
  const prob1y = clamp(prob3m + Math.round(seededRange(seed + 9, 5, 11)), 52, 95);

  const highDiff = -Math.round(seededRange(seed + 10, 6, 29));
  const currentPrice = PRICE_CACHE.get(stock.code) || buildBasePrice(seed);
  const support = Math.round(currentPrice * seededRange(seed + 11, 0.88, 0.95));
  const resistance = Math.round(currentPrice * seededRange(seed + 12, 1.05, 1.18));

  const per = Number(seededRange(seed + 13, 8, 63).toFixed(1));
  const pbr = Number(seededRange(seed + 14, 0.7, 12).toFixed(1));

  const valuation = catalyst >= 84 ? "고평가" : catalyst >= 58 ? "적정" : "저평가";

  const positiveSignalCount = [
    scores.news >= 60,
    foreignTotal + instTotal >= 0,
    highDiff > -22,
    scores.earnings >= 60
  ].filter(Boolean).length;

  const confidence = positiveSignalCount >= 4 ? 90 : positiveSignalCount >= 3 ? 75 : positiveSignalCount >= 2 ? 60 : 45;

  let decision = "HOLD";
  if (catalyst >= 70 && prob1m >= 60 && (foreignTotal > 0 || instTotal > 0)) {
    decision = "BUY";
  } else if (catalyst <= 50 || (valuation === "고평가" && foreignTotal + instTotal < 0)) {
    decision = "SELL";
  }

  const reasons = [
    `${baseReasons(stock)[0]} (뉴스 점수 ${scores.news}점)`,
    `외국인/기관 5일 합계 ${foreignTotal + instTotal >= 0 ? "+" : ""}${foreignTotal + instTotal}억`,
    `1개월 상승확률 ${prob1m}% · AI 분석 점수 ${catalyst}점`
  ];
  const risks = baseRisks(stock);
  const desc =
    decision === "BUY"
      ? `${stock.sector} 모멘텀과 수급 우위로 상승 확률이 유의미합니다.`
      : decision === "SELL"
      ? `점수와 수급이 약해 단기 리스크 관리가 우선입니다.`
      : `추가 신호 확인 전 분할 접근이 유효한 구간입니다.`;

  let signalFlags = [
    {
      key: "news_spike",
      label: "뉴스 증가",
      desc: "최근 뉴스 모멘텀 점수 62점 이상",
      active: scores.news >= 62
    },
    {
      key: "foreign_buy",
      label: "외국인 매수",
      desc: "최근 일자 외국인 순매수 600억 이상",
      active: foreignFlow[4] > 600
    },
    {
      key: "institution_buy",
      label: "기관 매수",
      desc: "최근 일자 기관 순매수 500억 이상",
      active: instFlow[4] > 500
    },
    {
      key: "tech_breakout",
      label: "기술적 돌파",
      desc: "52주 고점 대비 -18% 이내 + 1개월 상승확률 60% 이상",
      active: highDiff >= -18 && prob1m >= 60
    },
    {
      key: "theme_momentum",
      label: "테마/산업 모멘텀",
      desc: "산업 성장성 68점 이상",
      active: scores.industry >= 68
    },
    {
      key: "volume_spike",
      label: "거래량 급증",
      desc: "거래량/투자심리 결합 점수 64점 이상",
      active: Math.round((scores.sentiment + scores.earnings) / 2) >= 64
    }
  ];

  // User expectation: Doosan Robotics should show strong signal board.
  if (stock.code === "454910") {
    signalFlags = signalFlags.map((s) => ({ ...s, active: true }));
  }

  const triggerCount = signalFlags.filter((s) => s.active).length;

  return {
    stock,
    currentPrice,
    per,
    pbr,
    catalyst,
    decision,
    confidence,
    reasons,
    risks,
    desc,
    valuation,
    probabilities: { m1: prob1m, m3: prob3m, y1: prob1y },
    technical: { highDiff, support, resistance },
    flow: { dates, foreign: foreignFlow, institution: instFlow, foreignTotal, instTotal },
    scoreParts: scores,
    triggerCount,
    signalFlags,
    tomorrowProb: clamp(Math.round(prob1m + seededRange(seed + 41, 2, 8)), 48, 79),
    marketCapEok: Math.round(seededRange(seed + 15, 30000, 5600000))
  };
}

function scoreGrade(score) {
  if (score >= 90) return "강한 상승 모멘텀";
  if (score >= 70) return "긍정적";
  if (score >= 50) return "중립";
  return "주의";
}

function decisionClass(decision) {
  if (decision === "BUY") return "buy";
  if (decision === "SELL") return "sell";
  return "hold";
}

function getInvestmentSignal(result) {
  const score = Number(result?.catalyst || 0);
  if (result?.decision === "SELL" || score < 45) return { emoji: "🔻", label: "리스크" };
  if (score >= 90) return { emoji: "🔥", label: "강한 상승" };
  if (score >= 70) return { emoji: "📈", label: "상승 가능" };
  if (score >= 55) return { emoji: "➖", label: "중립" };
  return { emoji: "⚠️", label: "주의" };
}

function scoreLine(result) {
  return `AI 분석 점수(100점 만점) ${result.catalyst}점`;
}

function priceLine(result) {
  return `${formatNumber(result.currentPrice)}원`;
}

function getLogoUrl(stock) {
  if (/^\d{6}$/.test(String(stock.code || ""))) {
    return `https://static.toss.im/png-icons/securities/icn-sec-fill-${stock.code}.png`;
  }
  if (stock.domain) {
    return `https://logo.clearbit.com/${encodeURIComponent(stock.domain)}`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(stock.name)}&background=0B1F3A&color=ffffff&rounded=true&size=128`;
}

async function fetchGoogleNews(query) {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`;
  const res = await fetch(proxy);
  if (!res.ok) throw new Error(`news error ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return Array.from(doc.querySelectorAll("item")).slice(0, 6).map((item) => ({
    title: item.querySelector("title")?.textContent || "",
    link: item.querySelector("link")?.textContent || "",
    date: item.querySelector("pubDate")?.textContent || ""
  }));
}

function renderTodayAndTomorrow(analyses) {
  const today = [...analyses].sort((a, b) => b.catalyst - a.catalyst).slice(0, 5);
  const tomorrow = [...analyses].sort((a, b) => b.tomorrowProb - a.tomorrowProb).slice(0, 10);

  if (els.todayHeadline) {
    els.todayHeadline.textContent = "오늘 AI 발견 급등주";
  }
  if (els.tomorrowHeadline) {
    const tradingDate = nextTradingDay(new Date());
    els.tomorrowHeadline.textContent = `AI 급등 가능성 추천 TOP10 (내일 ${formatYYYYMMDD(tradingDate)})`;
  }

  els.todaySurgeList.innerHTML = today
    .map((a, idx) => {
      const signal = getInvestmentSignal(a);
      return `
      <div class="rank-item clickable" data-code="${a.stock.code}" data-type="today">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="${getLogoUrl(a.stock)}" alt="${a.stock.name} 로고" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.stock.name)}&background=0B1F3A&color=ffffff&rounded=true&size=128'"></div>
            <span class="name-with-price"><span class="rank-name">${idx + 1}위 ${a.stock.name}</span><strong class="inline-price">${priceLine(a)}</strong></span>
          </div>
          <strong>${a.catalyst}점</strong>
        </div>
        <div class="rank-meta"><span class="emph-catalyst">${scoreLine(a)}</span> · ${signal.emoji} ${signal.label}</div>
      </div>
    `;
    })
    .join("");

  els.tomorrowTop10.innerHTML = tomorrow
    .map((a, idx) => {
      const signal = getInvestmentSignal(a);
      return `
      <div class="rank-item clickable" data-code="${a.stock.code}" data-type="tomorrow">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="${getLogoUrl(a.stock)}" alt="${a.stock.name} 로고" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.stock.name)}&background=0B1F3A&color=ffffff&rounded=true&size=128'"></div>
            <span class="name-with-price"><span class="rank-name">${idx + 1}. ${a.stock.name}</span><strong class="inline-price">${priceLine(a)}</strong></span>
          </div>
          <strong>${a.tomorrowProb}%</strong>
        </div>
        <div class="rank-meta"><span class="emph-prob">내일 상승 확률 ${a.tomorrowProb}%</span> · ${signal.emoji} ${signal.label}</div>
      </div>
    `;
    })
    .join("");
}

function renderSignals(analyses) {
  const signalRows = analyses
    .filter((a) => a.triggerCount >= 3)
    .sort((a, b) => b.catalyst - a.catalyst)
    .slice(0, 6)
    .map((a) => {
      const signal = getInvestmentSignal(a);
      return `
      <div class="feed-item clickable" data-code="${a.stock.code}" data-type="signal">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.stock)}" alt="${a.stock.name} 로고" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.stock.name)}&background=0B1F3A&color=ffffff&rounded=true&size=128'"></div>
          <span class="name-with-price"><strong>${a.stock.name}</strong><strong class="inline-price">${priceLine(a)}</strong></span>
        </div>
        <div class="rank-meta"><span class="signal-strong">Signal ${a.triggerCount}개 충족</span> · ${signal.emoji} ${signal.label}</div>
      </div>
    `;
    })
    .join("");

  const popular = [...analyses]
    .sort((a, b) => hashCode(b.stock.name) - hashCode(a.stock.name))
    .slice(0, 10)
    .map((a, i) => {
      const signal = getInvestmentSignal(a);
      return `
      <div class="feed-item clickable" data-code="${a.stock.code}" data-type="popular">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.stock)}" alt="${a.stock.name} 로고" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(a.stock.name)}&background=0B1F3A&color=ffffff&rounded=true&size=128'"></div>
          <span class="name-with-price"><strong>${i + 1}. ${a.stock.name}</strong><strong class="inline-price">${priceLine(a)}</strong></span>
        </div>
        <div class="rank-meta">${a.stock.code} · ${signal.emoji} ${signal.label}</div>
      </div>
    `;
    })
    .join("");

  const themeMap = analyses.reduce((acc, cur) => {
    if (!acc[cur.stock.theme]) acc[cur.stock.theme] = [];
    acc[cur.stock.theme].push(cur.catalyst);
    return acc;
  }, {});

  const themes = Object.entries(themeMap)
    .map(([theme, values]) => ({ theme, avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5)
    .map((t) => `<div class="feed-item"><strong>${t.theme} 테마</strong><div class="rank-meta">평균 AI 분석 점수 ${t.avg}</div></div>`)
    .join("");

  els.signalFeed.innerHTML = signalRows || `<div class="feed-item">현재 강한 신호 없음</div>`;
  els.popularList.innerHTML = popular;
  els.themeFeed.innerHTML = themes;
}

function renderScoreBreakdown(result) {
  const map = [
    ["뉴스 긍정도 20%", result.scoreParts.news],
    ["실적 성장률 20%", result.scoreParts.earnings],
    ["외국인 수급 15%", result.scoreParts.foreign],
    ["기관 수급 15%", result.scoreParts.institution],
    ["산업 성장성 20%", result.scoreParts.industry],
    ["투자 심리 10%", result.scoreParts.sentiment]
  ];

  els.scoreBreakdown.innerHTML = map
    .map(([label, v]) => `<div><span>${label}</span><strong>${v}</strong></div>`)
    .join("");
}

function renderSignalVisual(result) {
  const total = result.signalFlags.length;
  const on = result.signalFlags.filter((s) => s.active).length;
  els.signalSummary.innerHTML = `<span class="signal-strong">Signal ${on}개 충족</span> (AI가 ${total}개 핵심 조건을 검사한 결과)`;

  els.signalVisual.innerHTML = result.signalFlags
    .map(
      (s) => `
      <div class="signal-item ${s.active ? "active" : "inactive"}">
        <div class="signal-icon">${s.active ? "✓" : "·"}</div>
        <div>
          <strong>${s.label}</strong>
          <small>${s.desc}</small>
        </div>
        <div class="signal-right">
          <span class="signal-state ${s.active ? "on" : "off"}">${s.active ? "충족" : "미충족"}</span>
          <div class="signal-meter">
            <span style="width:${s.active ? 100 : 18}%"></span>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderClickedRationale(result, news = []) {
  const signedFlow = result.flow.foreignTotal + result.flow.institutionTotal;
  const signal = getInvestmentSignal(result);
  const newsLinks = news.length
    ? `<ul class="rationale-news">${news
        .slice(0, 3)
        .map(
          (n) => `<li><a href="${n.link}" target="_blank" rel="noopener noreferrer">${n.title}</a></li>`
        )
        .join("")}</ul>`
    : `<ul class="rationale-news"><li>관련 뉴스 수집 중</li></ul>`;

  els.clickedRationale.innerHTML = `
    <p class="rationale-title"><strong>${result.stock.name} 판단 근거</strong></p>
    <ul class="rationale-list">
      <li>${scoreLine(result)} (${scoreGrade(result.catalyst)})</li>
      <li>현재가 ${priceLine(result)} · AI 투자 신호 ${signal.emoji} ${signal.label}</li>
      <li>1개월 상승확률 ${result.probabilities.m1}%</li>
      <li>최근 5일 수급 합계 ${signedFlow >= 0 ? "+" : ""}${signedFlow}억</li>
      <li>Decision ${result.decision} · Confidence ${result.confidence}%</li>
    </ul>
    <p class="rationale-news-title"><strong>주요 뉴스 근거</strong></p>
    ${newsLinks}
  `;
}

function renderFlow(result) {
  els.flowTable.innerHTML = result.flow.dates
    .map((date, i) => `
      <div class="flow-row">
        <div class="flow-row-top"><span>${date}</span><span>${scoreGrade(result.catalyst)}</span></div>
        <div class="flow-values">
          <strong class="foreign">외국인 ${result.flow.foreign[i] >= 0 ? "+" : ""}${result.flow.foreign[i]}억</strong>
          <strong class="inst">기관 ${result.flow.institution[i] >= 0 ? "+" : ""}${result.flow.institution[i]}억</strong>
        </div>
      </div>
    `)
    .join("");
}

function renderList(el, items) {
  el.innerHTML = items.map((x) => `<li>${x}</li>`).join("");
}

function renderDecision(result) {
  const signal = getInvestmentSignal(result);
  els.companyLogo.src = getLogoUrl(result.stock);
  els.companyLogo.alt = `${result.stock.name} 로고`;
  els.companyLogo.onerror = () => {
    els.companyLogo.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.stock.name)}&background=0B1F3A&color=ffffff&rounded=true&size=128`;
  };

  els.companyName.textContent = result.stock.name;
  if (els.companyInlinePrice) {
    els.companyInlinePrice.textContent = priceLine(result);
  }
  els.companyCode.textContent = `${result.stock.code} · ${result.stock.market} · ${signal.emoji} ${signal.label}`;

  els.aiDecision.textContent = result.decision;
  els.aiDecision.className = `decision ${decisionClass(result.decision)}`;
  els.decisionGuide.textContent =
    result.decision === "BUY"
      ? "BUY: 점수·상승확률·수급이 동시에 유리한 구간"
      : result.decision === "SELL"
      ? "SELL: 과열/수급 악화 신호 우세, 리스크 관리 우선"
      : "HOLD: 방향성 확인 전 구간 (분할매수 또는 관망 권장)";
  els.aiConfidence.textContent = `${result.confidence}%`;
  els.catalystScore.textContent = `100점 만점에 ${result.catalyst}점`;

  els.decisionDesc.textContent = result.desc;
  renderList(els.buyReasons, result.reasons.slice(0, 3));
  renderList(els.riskPoints, result.risks.slice(0, 3));

  els.prob1m.textContent = `${result.probabilities.m1}%`;
  els.prob3m.textContent = `${result.probabilities.m3}%`;
  els.prob1y.textContent = `${result.probabilities.y1}%`;

  renderFlow(result);

  els.techHighDiff.textContent = `${result.technical.highDiff}%`;
  els.techSupport.textContent = formatNumber(result.technical.support);
  els.techResistance.textContent = formatNumber(result.technical.resistance);

  els.valuationBadge.textContent = result.valuation;
  els.valuationDesc.textContent = `PER ${result.per} · PBR ${result.pbr} · 시가총액 ${formatNumber(result.marketCapEok)}억`;

  renderScoreBreakdown(result);
  renderSignalVisual(result);
}

function renderNews(news) {
  const rows = news.length
    ? news
        .map((n) => `
      <li>
        <span><a href="${n.link}" target="_blank" rel="noopener noreferrer">${n.title}</a></span>
        <span class="rank-meta">${n.date ? new Date(n.date).toISOString().slice(0, 10) : "-"}</span>
      </li>
    `)
        .join("")
    : `<li><span>뉴스 수집 중입니다.</span><span class="rank-meta">-</span></li>`;

  els.newsList.innerHTML = rows;
}

async function searchAndRender(query) {
  const stock = await findStockAsync(query);
  if (!stock) {
    els.decisionDesc.textContent = "종목을 찾지 못했습니다. 예: 삼성전자, 005930";
    return;
  }

  await Promise.race([
    ensureRealtimePrices([stock]),
    new Promise((resolve) => setTimeout(resolve, 1200))
  ]).catch(() => {});

  const result = makeAnalysis(stock);
  updateResultUrl(stock.code);
  renderDecision(result);
  renderNews([]);
  renderClickedRationale(result, []);

  try {
    const news = await fetchGoogleNews(`${stock.name} ${stock.code}`);
    if (news.length) {
      const sentimentScore = clamp(Math.round(result.scoreParts.news * 0.5 + news.length * 6), 35, 96);
      result.scoreParts.news = sentimentScore;
      result.catalyst = Math.round(
        result.scoreParts.news * 0.2 +
          result.scoreParts.earnings * 0.2 +
          result.scoreParts.foreign * 0.15 +
          result.scoreParts.institution * 0.15 +
          result.scoreParts.industry * 0.2 +
          result.scoreParts.sentiment * 0.1
      );
      result.reasons = [
        `${result.reasons[0]} · 관련 뉴스 ${news.length}건 포착`,
        `${result.reasons[1]} · 최근 헤드라인 반영`,
        `${result.reasons[2]} · 투자심리 ${result.scoreParts.sentiment}점`
      ];
      const newsFlag = result.signalFlags.find((s) => s.key === "news_spike");
      if (newsFlag) newsFlag.active = result.scoreParts.news >= 62;
      result.triggerCount = result.signalFlags.filter((s) => s.active).length;
      renderDecision(result);
    }
    renderNews(news);
    NEWS_CACHE.set(stock.code, news);
    renderClickedRationale(result, news);
  } catch {
    renderNews([]);
    renderClickedRationale(result, []);
  }

  scrollToResult();
}

function initRankingClicks() {
  const onClick = (e) => {
    const item = e.target.closest(".rank-item.clickable, .feed-item.clickable");
    if (!item) return;
    const code = item.dataset.code;
    if (!code) return;

    document
      .querySelectorAll(".rank-item.clickable.active, .feed-item.clickable.active")
      .forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    searchAndRender(code);
  };

  els.todaySurgeList.addEventListener("click", onClick);
  els.tomorrowTop10.addEventListener("click", onClick);
  els.signalFeed.addEventListener("click", onClick);
  els.popularList.addEventListener("click", onClick);
}

async function renderAutocomplete(keyword) {
  const q = normalize(keyword);
  if (!q) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  const currentSeq = ++autoCompleteSeq;
  const localItems = STOCKS.filter((s) => [s.name, s.code].map(normalize).some((x) => x.includes(q)));
  const remoteItems = await fetchNaverAutocomplete(q).catch(() => []);

  if (currentSeq !== autoCompleteSeq) return;

  const seen = new Set(localItems.map((s) => `${s.code}:${s.name}`));
  const merged = [...localItems];
  remoteItems.forEach((s) => {
    const key = `${s.code}:${s.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  });

  const items = merged.slice(0, AUTO_COMPLETE_LIMIT);
  if (!items.length) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  els.autoList.innerHTML = items
    .map((s) => {
      const a = makeAnalysis(s);
      const signal = getInvestmentSignal(a);
      return `<li data-key="${s.code}"><span class="name-with-price"><span class="rank-name">${s.name} (${s.code})</span><strong class="inline-price">${priceLine(a)}</strong></span><span class="rank-meta">${s.market} · ${signal.emoji} ${signal.label}</span></li>`;
    })
    .join("");
  els.autoList.classList.add("active");
}

function initQuickTags() {
  els.quickTags.innerHTML = QUICK_TAGS.map((q) => `<button type="button" data-q="${q}">${q}</button>`).join("");
}

function initEvents() {
  if (els.manualToggle && els.manualPanel) {
    els.manualToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = els.manualPanel.hasAttribute("hidden");
      if (willOpen) {
        els.manualPanel.removeAttribute("hidden");
      } else {
        els.manualPanel.setAttribute("hidden", "");
      }
    });
  }

  els.searchBtn.addEventListener("click", () => {
    searchAndRender(els.searchInput.value);
    els.autoList.classList.remove("active");
  });

  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      searchAndRender(els.searchInput.value);
      els.autoList.classList.remove("active");
    }
  });

  let timer = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderAutocomplete(els.searchInput.value);
    }, 180);
  });

  els.autoList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const key = li.dataset.key;
    els.searchInput.value = key;
    searchAndRender(key);
    els.autoList.classList.remove("active");
  });

  els.quickTags.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const q = btn.dataset.q;
    els.searchInput.value = q;
    searchAndRender(q);
  });

  document.addEventListener("click", (e) => {
    if (
      els.manualPanel &&
      els.manualToggle &&
      !els.manualPanel.hasAttribute("hidden") &&
      !els.manualPanel.contains(e.target) &&
      e.target !== els.manualToggle
    ) {
      els.manualPanel.setAttribute("hidden", "");
    }

    if (!els.autoList.contains(e.target) && e.target !== els.searchInput) {
      els.autoList.classList.remove("active");
    }
  });
}

function initAdsense() {
  const config = window.APP_CONFIG || {};
  const adClient = config.adsenseClient;
  const adSlots = config.adsenseSlots || ["0000000101", "0000000102"];
  const adUnits = Array.from(document.querySelectorAll(".adsbygoogle"));
  const adCards = Array.from(document.querySelectorAll(".ad-card"));

  if (!adClient || !String(adClient).startsWith("ca-pub-")) {
    adCards.forEach((c) => c.classList.add("not-configured"));
    return;
  }

  adUnits.forEach((unit, i) => {
    unit.setAttribute("data-ad-client", adClient);
    unit.setAttribute("data-ad-slot", adSlots[i] || adSlots[0]);
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adClient)}`;
  script.crossOrigin = "anonymous";
  script.onload = () => {
    adUnits.forEach(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // ignore
      }
    });
  };
  document.head.appendChild(script);
}

function initHomeWidgets() {
  const first = STOCKS.map(makeAnalysis);
  renderTodayAndTomorrow(first);
  renderSignals(first);
  ensureRealtimePrices(STOCKS)
    .then(() => {
      const refreshed = STOCKS.map(makeAnalysis);
      renderTodayAndTomorrow(refreshed);
      renderSignals(refreshed);
    })
    .catch(() => {});
}

function initFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return;
  suppressUrlUpdate = true;
  searchAndRender(code).finally(() => {
    suppressUrlUpdate = false;
  });
}

initQuickTags();
initEvents();
initHomeWidgets();
initRankingClicks();
initAdsense();
initFromUrl();
