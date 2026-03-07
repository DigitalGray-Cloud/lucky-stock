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

const els = {
  searchInput: document.getElementById("stock-search"),
  searchBtn: document.getElementById("search-btn"),
  autoList: document.getElementById("autocomplete-list"),
  quickTags: document.getElementById("quick-tags"),
  todaySurgeList: document.getElementById("today-surge-list"),
  tomorrowTop10: document.getElementById("tomorrow-top10"),
  signalFeed: document.getElementById("signal-feed"),
  popularList: document.getElementById("popular-list"),
  themeFeed: document.getElementById("theme-feed"),
  companyLogo: document.getElementById("company-logo-img"),
  companyName: document.getElementById("company-name"),
  companyCode: document.getElementById("company-code"),
  aiDecision: document.getElementById("ai-decision"),
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
  newsList: document.getElementById("news-list")
};

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

function findStock(query) {
  const q = normalize(query);
  if (!q) return null;
  return STOCKS.find((s) => [s.name, s.code].map(normalize).some((v) => v.includes(q)));
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
  const currentPrice = buildBasePrice(seed);
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

  const reasons = baseReasons(stock);
  const risks = baseRisks(stock);
  const desc =
    decision === "BUY"
      ? `${stock.sector} 모멘텀과 수급 우위로 상승 확률이 유의미합니다.`
      : decision === "SELL"
      ? `점수와 수급이 약해 단기 리스크 관리가 우선입니다.`
      : `추가 신호 확인 전 분할 접근이 유효한 구간입니다.`;

  const triggerCount = [
    scores.news >= 62,
    Math.abs(foreignFlow[4]) > 600,
    Math.abs(instFlow[4]) > 500,
    prob1m >= 60,
    highDiff >= -18,
    scores.industry >= 68
  ].filter(Boolean).length;

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

function getLogoUrl(stock) {
  return `https://logo.clearbit.com/${encodeURIComponent(stock.domain)}`;
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

  els.todaySurgeList.innerHTML = today
    .map((a, idx) => `
      <div class="rank-item">
        <div class="rank-top">
          <span class="rank-name">${idx + 1}위 ${a.stock.name}</span>
          <strong>${a.catalyst}</strong>
        </div>
        <div class="rank-meta">Catalyst Score ${a.catalyst} · AI Decision ${a.decision}</div>
      </div>
    `)
    .join("");

  els.tomorrowTop10.innerHTML = tomorrow
    .map((a, idx) => `
      <div class="rank-item">
        <div class="rank-top">
          <span class="rank-name">${idx + 1}. ${a.stock.name}</span>
          <strong>${a.tomorrowProb}%</strong>
        </div>
        <div class="rank-meta">상승 확률 ${a.tomorrowProb}% · ${a.stock.code}</div>
      </div>
    `)
    .join("");
}

function renderSignals(analyses) {
  const signalRows = analyses
    .filter((a) => a.triggerCount >= 3)
    .sort((a, b) => b.catalyst - a.catalyst)
    .slice(0, 6)
    .map((a) => `
      <div class="feed-item">
        <strong>${a.stock.name}</strong>
        <div class="rank-meta">Signal ${a.triggerCount}개 충족 · ${a.catalyst}점 · ${a.decision}</div>
      </div>
    `)
    .join("");

  const popular = [...analyses]
    .sort((a, b) => hashCode(b.stock.name) - hashCode(a.stock.name))
    .slice(0, 10)
    .map((a, i) => `
      <div class="feed-item"><strong>${i + 1}. ${a.stock.name}</strong><div class="rank-meta">${a.stock.code}</div></div>
    `)
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
    .map((t) => `<div class="feed-item"><strong>${t.theme} 테마</strong><div class="rank-meta">평균 Catalyst ${t.avg}</div></div>`)
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
  els.companyLogo.src = getLogoUrl(result.stock);
  els.companyLogo.alt = `${result.stock.name} 로고`;
  els.companyLogo.onerror = () => {
    els.companyLogo.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(result.stock.domain)}&sz=128`;
  };

  els.companyName.textContent = result.stock.name;
  els.companyCode.textContent = `${result.stock.code} · ${result.stock.market}`;

  els.aiDecision.textContent = result.decision;
  els.aiDecision.className = `decision ${decisionClass(result.decision)}`;
  els.aiConfidence.textContent = `${result.confidence}%`;
  els.catalystScore.textContent = `${result.catalyst} / 100`;

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
  const stock = findStock(query);
  if (!stock) {
    els.decisionDesc.textContent = "종목을 찾지 못했습니다. 예: 삼성전자, 005930";
    return;
  }

  const result = makeAnalysis(stock);
  renderDecision(result);
  renderNews([]);

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
      renderDecision(result);
    }
    renderNews(news);
  } catch {
    renderNews([]);
  }
}

function renderAutocomplete(keyword) {
  const q = normalize(keyword);
  if (!q) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  const items = STOCKS.filter((s) => [s.name, s.code].map(normalize).some((x) => x.includes(q))).slice(0, 8);
  if (!items.length) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  els.autoList.innerHTML = items.map((s) => `<li data-key="${s.code}">${s.name} (${s.code})</li>`).join("");
  els.autoList.classList.add("active");
}

function initQuickTags() {
  els.quickTags.innerHTML = QUICK_TAGS.map((q) => `<button type="button" data-q="${q}">${q}</button>`).join("");
}

function initEvents() {
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
    timer = setTimeout(() => renderAutocomplete(els.searchInput.value), 140);
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
  const analyses = STOCKS.map(makeAnalysis);
  renderTodayAndTomorrow(analyses);
  renderSignals(analyses);
}

initQuickTags();
initEvents();
initHomeWidgets();
initAdsense();
searchAndRender("005930");
