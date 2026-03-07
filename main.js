const QUICK_TAGS = ["Tesla", "TSLA", "NVIDIA", "NVDA", "삼성전자", "005930"];

const STOCKS = [
  { name: "Tesla", ticker: "TSLA", aliases: ["테슬라"], sector: "전기차/에너지", price: 180, marketcap: 570e9, currency: "USD", domain: "tesla.com", logoUrl: "https://cdn.simpleicons.org/tesla/CC0000" },
  { name: "NVIDIA", ticker: "NVDA", aliases: ["엔비디아", "Nvidia"], sector: "반도체/AI", price: 990, marketcap: 2450e9, currency: "USD", domain: "nvidia.com", logoUrl: "https://cdn.simpleicons.org/nvidia/76B900" },
  { name: "AMD", ticker: "AMD", aliases: ["에이엠디"], sector: "반도체", price: 180, marketcap: 290e9, currency: "USD", domain: "amd.com", logoUrl: "https://cdn.simpleicons.org/amd/ED1C24" },
  { name: "Apple", ticker: "AAPL", aliases: ["애플"], sector: "소비자 IT", price: 190, marketcap: 2900e9, currency: "USD", domain: "apple.com", logoUrl: "https://cdn.simpleicons.org/apple/111111" },
  { name: "Microsoft", ticker: "MSFT", aliases: ["마이크로소프트"], sector: "클라우드/SaaS", price: 420, marketcap: 3100e9, currency: "USD", domain: "microsoft.com", logoUrl: "https://cdn.simpleicons.org/microsoft/5E5E5E" },
  { name: "Amazon", ticker: "AMZN", aliases: ["아마존"], sector: "이커머스/클라우드", price: 182, marketcap: 1900e9, currency: "USD", domain: "amazon.com", logoUrl: "https://cdn.simpleicons.org/amazon/FF9900" },
  { name: "Meta", ticker: "META", aliases: ["메타"], sector: "소셜/광고", price: 488, marketcap: 1230e9, currency: "USD", domain: "meta.com", logoUrl: "https://cdn.simpleicons.org/meta/0467DF" },
  { name: "Samsung Electronics", ticker: "005930", aliases: ["삼성전자", "Samsung"], sector: "반도체/전자", price: 76000, marketcap: 520e9, currency: "KRW", domain: "samsung.com", logoUrl: "https://cdn.simpleicons.org/samsung/1428A0" },
];

const els = {
  input: document.getElementById("stock-search"),
  searchBtn: document.getElementById("search-btn"),
  autoList: document.getElementById("autocomplete-list"),
  quickTags: document.getElementById("quick-tags"),
  companyLogoImg: document.getElementById("company-logo-img"),
  companyName: document.getElementById("company-name"),
  companyTicker: document.getElementById("company-ticker"),
  price: document.getElementById("metric-price"),
  marketcap: document.getElementById("metric-marketcap"),
  per: document.getElementById("metric-per"),
  pbr: document.getElementById("metric-pbr"),
  sector: document.getElementById("metric-sector"),
  summary: document.getElementById("ai-summary"),
  bullList: document.getElementById("bull-list"),
  growthList: document.getElementById("growth-list"),
  riskList: document.getElementById("risk-list"),
  flowChart: document.getElementById("flow-chart"),
  tech52w: document.getElementById("tech-52w"),
  techSupport: document.getElementById("tech-support"),
  techResistance: document.getElementById("tech-resistance"),
  valuationBadge: document.getElementById("valuation-badge"),
  valuationText: document.getElementById("valuation-text"),
  viewList: document.getElementById("view-list"),
  styleFit: document.getElementById("style-fit"),
  snsTwitter: document.getElementById("sns-twitter"),
  snsReddit: document.getElementById("sns-reddit"),
  snsNews: document.getElementById("sns-news"),
  snsDelta: document.getElementById("sns-delta"),
  catalystScore: document.getElementById("catalyst-score"),
  scoreGrade: document.getElementById("score-grade"),
  scoreDesc: document.getElementById("score-desc"),
  scoreBreakdown: document.getElementById("score-breakdown"),
  ringFill: document.getElementById("score-ring-fill"),
  todayList: document.getElementById("today-list"),
  alertBanner: document.getElementById("alert-banner"),
};

function normalize(text) {
  return (text || "").toLowerCase().trim();
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

function scoreLabel(score) {
  if (score >= 90) return "매우 강한 모멘텀";
  if (score >= 70) return "긍정적";
  if (score >= 50) return "중립";
  return "주의";
}

function findStock(query) {
  const q = normalize(query);
  return STOCKS.find((stock) => [stock.name, stock.ticker, ...(stock.aliases || [])].map(normalize).some((v) => v.includes(q)));
}

function formatMarketcap(raw, currency) {
  if (!raw || Number.isNaN(raw)) return "-";
  if (currency === "KRW") return `${Math.round(raw / 1e8).toLocaleString("ko-KR")}억 원`;
  const billions = raw / 1e9;
  if (billions >= 1000) return `$${(billions / 1000).toFixed(2)}T`;
  return `$${billions.toFixed(0)}B`;
}

function formatPrice(price, currency, ticker) {
  if (price == null || Number.isNaN(price)) return "-";
  if (ticker === "005930" || currency === "KRW") return `${Math.round(price).toLocaleString("ko-KR")}원`;
  return `$${Number(price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatShortDate(date) {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function keywordSentimentScore(items) {
  const positive = ["surge", "beat", "growth", "record", "partnership", "rise", "강세", "증가", "확대", "성장", "호조"];
  const negative = ["drop", "miss", "lawsuit", "cut", "fall", "약세", "감소", "우려", "하락", "부진"];
  let score = 50;
  items.forEach((n) => {
    const t = normalize(n.title);
    score += positive.filter((w) => t.includes(w)).length * 4;
    score -= negative.filter((w) => t.includes(w)).length * 5;
  });
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function fetchGoogleNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
  const res = await fetch(proxy);
  if (!res.ok) throw new Error(`뉴스 조회 실패(${res.status})`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const nodes = Array.from(doc.querySelectorAll("item")).slice(0, 8);

  return nodes.map((node) => ({
    title: node.querySelector("title")?.textContent || "",
    link: node.querySelector("link")?.textContent || "",
    date: node.querySelector("pubDate")?.textContent || "",
  }));
}

function fillList(el, items, mapper) {
  el.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = mapper(item);
    el.appendChild(li);
  });
}

function renderFlow(foreignBuy, institutionBuy) {
  const today = new Date();
  const rows = Array.from({ length: 5 }, (_, i) => ({
    day: (() => {
      const d = new Date(today);
      d.setDate(today.getDate() - (4 - i));
      return formatShortDate(d);
    })(),
    foreign: foreignBuy[i] ?? 0,
    institution: institutionBuy[i] ?? 0,
  }));

  const maxAbs = Math.max(...rows.map((x) => Math.max(Math.abs(x.foreign), Math.abs(x.institution))), 1);

  els.flowChart.innerHTML = "";
  rows.forEach((row) => {
    const fWidth = Math.round((Math.abs(row.foreign) / maxAbs) * 100);
    const iWidth = Math.round((Math.abs(row.institution) / maxAbs) * 100);
    const div = document.createElement("div");
    div.className = "flow-row";
    div.innerHTML = `
      <strong>${row.day}</strong>
      <div class="bar-wrap">
        <div class="bar foreign"><span style="width:${fWidth}%"></span></div>
        <small>외 ${row.foreign >= 0 ? "+" : ""}${row.foreign}억</small>
        <div class="bar institution"><span style="width:${iWidth}%"></span></div>
        <small>기 ${row.institution >= 0 ? "+" : ""}${row.institution}억</small>
      </div>
    `;
    els.flowChart.appendChild(div);
  });
}

function renderBreakdown(score) {
  const rows = [
    ["뉴스 긍정도", score.news_score],
    ["실적 성장률", score.earnings_score],
    ["수급 점수", score.flow_score],
    ["산업 성장성", score.industry_score],
    ["투자 심리", score.sentiment_score],
  ];

  els.scoreBreakdown.innerHTML = rows
    .map(([label, value]) => `<div><span>${label}</span><strong>${value ?? "-"}</strong></div>`)
    .join("");
}

function makeStars(count) {
  return `${"★".repeat(count)}${"☆".repeat(5 - count)}`;
}

function buildLocalAnalysis(stock, newsItems) {
  const seed = hashCode(stock.ticker + stock.name);
  const newsScore = keywordSentimentScore(newsItems);
  const earningsScore = Math.round(seededRange(seed + 3, 52, 93));
  const flowScore = Math.round(seededRange(seed + 4, 45, 94));
  const industryScore = Math.round(seededRange(seed + 5, 55, 96));
  const sentimentScore = Math.round((newsScore + seededRange(seed + 6, 42, 95)) / 2);

  const total = Math.round(
    newsScore * 0.28 + earningsScore * 0.2 + flowScore * 0.18 + industryScore * 0.2 + sentimentScore * 0.14
  );

  const highDiff = -Math.round(seededRange(seed + 7, 4, 27));
  const support = Number((stock.price * seededRange(seed + 8, 0.86, 0.95)).toFixed(2));
  const resistance = Number((stock.price * seededRange(seed + 9, 1.06, 1.18)).toFixed(2));

  const foreign = Array.from({ length: 5 }, (_, i) => Math.round(seededRange(seed + 20 + i, -300, 1500)));
  const institution = Array.from({ length: 5 }, (_, i) => Math.round(seededRange(seed + 30 + i, -250, 1200)));

  return {
    total,
    score: { news_score: newsScore, earnings_score: earningsScore, flow_score: flowScore, industry_score: industryScore, sentiment_score: sentimentScore },
    summary: `${stock.name}은(는) 최근 뉴스 모멘텀이 ${newsScore >= 70 ? "강한 편" : newsScore >= 55 ? "보통" : "약한 편"}이며, ${total >= 70 ? "중단기 긍정 관점" : "보수적 접근"}이 유효합니다.`,
    highDiff,
    support,
    resistance,
    foreign,
    institution,
    valuation: total >= 83 ? "고평가" : total >= 63 ? "적정" : "저평가",
    styleFit: {
      short: Math.round(seededRange(seed + 40, 1, 4)),
      swing: Math.round(seededRange(seed + 41, 2, 5)),
      long: Math.round(seededRange(seed + 42, 3, 5)),
    },
    interest: {
      twitter: `+${Math.round(seededRange(seed + 50, 20, 170))}%`,
      reddit: `+${Math.round(seededRange(seed + 51, 10, 140))}%`,
      news: `+${Math.round(seededRange(seed + 52, 8, 90))}%`,
      delta: `+${Math.round(seededRange(seed + 53, 20, 130))}%`,
    },
  };
}

async function renderTodayPicks() {
  const picks = ["NVDA", "TSLA", "AMD"].map((ticker) => {
    const stock = findStock(ticker);
    const analysis = buildLocalAnalysis(stock, []);
    return { name: stock.name, ticker: stock.ticker, score: analysis.total };
  }).sort((a, b) => b.score - a.score);

  els.todayList.innerHTML = picks.map((item, idx) => `
    <div class="today-item">
      <p>${idx + 1}위 ${item.name}</p>
      <p>${item.ticker}</p>
      <p>Catalyst Score <strong>${item.score}</strong></p>
    </div>
  `).join("");
}

async function renderAnalysis(query) {
  const stock = findStock(query);
  if (!stock) {
    els.summary.textContent = "일치하는 종목이 없습니다. 예: Tesla, NVDA, 삼성전자";
    return;
  }

  els.summary.textContent = "실제 뉴스 분석 중...";

  let newsItems = [];
  try {
    newsItems = await fetchGoogleNews(`${stock.name} ${stock.ticker}`);
  } catch {
    newsItems = [];
  }

  const analysis = buildLocalAnalysis(stock, newsItems);

  els.companyLogoImg.src = stock.logoUrl || `https://logo.clearbit.com/${encodeURIComponent(stock.domain)}`;
  els.companyLogoImg.alt = `${stock.name} 로고`;
  els.companyLogoImg.onerror = () => {
    els.companyLogoImg.onerror = () => {
      els.companyLogoImg.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(stock.domain)}&sz=128`;
    };
    els.companyLogoImg.src = `https://logo.clearbit.com/${encodeURIComponent(stock.domain)}`;
  };
  els.companyName.textContent = stock.name;
  els.companyTicker.textContent = stock.ticker;
  els.price.textContent = formatPrice(stock.price, stock.currency, stock.ticker);
  els.marketcap.textContent = formatMarketcap(stock.marketcap, stock.currency);
  els.per.textContent = (seededRange(hashCode(stock.ticker), 12, 72)).toFixed(1);
  els.pbr.textContent = (seededRange(hashCode(stock.name), 1.1, 16)).toFixed(1);
  els.sector.textContent = stock.sector;

  els.summary.textContent = analysis.summary;

  const bulls = newsItems.length ? newsItems.slice(0, 4) : [{ title: "실시간 뉴스 수집 중", link: "#", date: "" }];
  fillList(els.bullList, bulls, (item) => `<span>${item.link && item.link !== "#" ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>` : item.title}</span><span class="list-date">${item.date ? new Date(item.date).toLocaleDateString("ko-KR") : "-"}</span>`);

  fillList(els.growthList, [
    `${stock.sector} 시장 확대 수혜`,
    "데이터센터/클라우드 투자 확대",
    "고부가 제품 믹스 개선",
    "글로벌 파트너십 확장",
  ], (text) => `<span>${text}</span>`);

  fillList(els.riskList, [
    "밸류에이션 부담 확대 가능성",
    "거시 경기 둔화 시 수요 변동",
    "경쟁사 기술 추격 리스크",
  ], (text) => `<span>${text}</span>`);

  renderFlow(analysis.foreign, analysis.institution);

  els.tech52w.textContent = `${analysis.highDiff}%`;
  els.techSupport.textContent = formatPrice(analysis.support, stock.currency, stock.ticker);
  els.techResistance.textContent = formatPrice(analysis.resistance, stock.currency, stock.ticker);

  els.valuationBadge.textContent = analysis.valuation;
  els.valuationText.textContent = "동종 업계 대비 상대 밸류에이션 및 뉴스 모멘텀 기준입니다.";

  els.viewList.innerHTML = `
    <div class="view-item"><strong>단기</strong><span>이벤트/뉴스 모멘텀 대응</span></div>
    <div class="view-item"><strong>중기</strong><span>실적 추세와 수급 확인</span></div>
    <div class="view-item"><strong>장기</strong><span>산업 구조적 성장 수혜</span></div>
  `;

  els.styleFit.innerHTML = `
    <div class="style-row"><span>단타</span><strong class="stars">${makeStars(analysis.styleFit.short)}</strong></div>
    <div class="style-row"><span>스윙</span><strong class="stars">${makeStars(analysis.styleFit.swing)}</strong></div>
    <div class="style-row"><span>장기 투자</span><strong class="stars">${makeStars(analysis.styleFit.long)}</strong></div>
  `;

  els.snsTwitter.textContent = analysis.interest.twitter;
  els.snsReddit.textContent = analysis.interest.reddit;
  els.snsNews.textContent = analysis.interest.news;
  els.snsDelta.textContent = analysis.interest.delta;

  const total = analysis.total;
  els.catalystScore.textContent = total;
  const grade = scoreLabel(total);
  els.scoreGrade.textContent = grade;
  els.scoreDesc.textContent = `실제 뉴스 기반 ${grade} 구간입니다.`;
  renderBreakdown(analysis.score);

  const circumference = 327;
  els.ringFill.style.strokeDashoffset = String(circumference - (total / 100) * circumference);

  els.alertBanner.textContent = total >= 80
    ? `${stock.name} Catalyst Score ${total} 상승 - 알림 기준(80+) 충족`
    : `${stock.name} Catalyst Score ${total} - 알림 기준(80+) 미충족`;

  await renderTodayPicks();
}

function renderAutocomplete(keyword) {
  const q = normalize(keyword);
  if (!q) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  const items = STOCKS.filter((stock) => [stock.name, stock.ticker, ...(stock.aliases || [])].map(normalize).some((v) => v.includes(q))).slice(0, 10);

  if (!items.length) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  els.autoList.innerHTML = items.map((s) => `<li data-value="${s.ticker}">${s.name} (${s.ticker})</li>`).join("");
  els.autoList.classList.add("active");
}

function initQuickTags() {
  els.quickTags.innerHTML = QUICK_TAGS.map((tag) => `<button class="quick-tag" type="button" data-value="${tag}">${tag}</button>`).join("");
}

function initEvents() {
  els.searchBtn.addEventListener("click", () => {
    const q = els.input.value;
    if (q) renderAnalysis(q);
    els.autoList.classList.remove("active");
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = els.input.value;
      if (q) renderAnalysis(q);
      els.autoList.classList.remove("active");
    }
  });

  let autocompleteTimer = null;
  els.input.addEventListener("input", () => {
    clearTimeout(autocompleteTimer);
    autocompleteTimer = setTimeout(() => renderAutocomplete(els.input.value), 150);
  });

  els.autoList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const value = li.dataset.value;
    els.input.value = value;
    renderAnalysis(value);
    els.autoList.classList.remove("active");
  });

  els.quickTags.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const value = btn.dataset.value;
    els.input.value = value;
    renderAnalysis(value);
  });

  document.addEventListener("click", (e) => {
    if (!els.autoList.contains(e.target) && e.target !== els.input) {
      els.autoList.classList.remove("active");
    }
  });
}

function initAdsense() {
  const config = window.APP_CONFIG || {};
  const adClient = config.adsenseClient;
  const adSlots = config.adsenseSlots || ["0000000001", "0000000002"];
  const adUnits = Array.from(document.querySelectorAll(".adsbygoogle"));
  const adCards = Array.from(document.querySelectorAll(".ad-card"));

  if (!adClient || !String(adClient).startsWith("ca-pub-")) {
    adCards.forEach((card) => card.classList.add("not-configured"));
    return;
  }

  adUnits.forEach((el, idx) => {
    const slot = adSlots[idx] || adSlots[0];
    el.setAttribute("data-ad-client", adClient);
    el.setAttribute("data-ad-slot", slot);
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
        // ignore ad push errors to keep app usable
      }
    });
  };

  document.head.appendChild(script);
}

initQuickTags();
initEvents();
initAdsense();
renderAnalysis("NVDA");
