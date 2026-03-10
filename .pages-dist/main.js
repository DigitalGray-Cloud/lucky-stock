const QUICK_TAGS = ["삼성전자", "005930", "SK하이닉스", "000660", "삼천당제약", "000250", "NAVER", "035420"];
const AUTO_COMPLETE_LIMIT = 12;

const els = {
  resultPanel: document.getElementById("result-panel"),
  searchLoading: document.getElementById("search-loading"),
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
  companyCode: document.getElementById("company-code"),
  stockPageLinkTop: document.getElementById("stock-page-link-top"),
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
  signalVisual: document.getElementById("signal-visual"),
  shareStatus: document.getElementById("share-status"),
  shareCopyBtn: document.getElementById("share-copy-btn")
};

let autoCompleteSeq = 0;
let suppressUrlUpdate = false;
let currentSelectionContext = { source: "search" };

const cacheState = {
  loaded: false,
  autocomplete: [],
  analysisMap: {},
  top: [],
  recent: [],
  themes: [],
  newsMap: {},
  homeToday: [],
  homeTomorrow: [],
  homeSignal: [],
  naverPopular: [],
  naverPopularMap: {}
};

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function formatNumber(value) {
  return Number(value).toLocaleString("ko-KR");
}

function getSignalEmoji(signal, fallback = "") {
  if (fallback) return fallback;
  if (signal === "상승 가능") return "📈";
  if (signal === "중립") return "➖";
  return "⚠️";
}

function buildFiveQaSummaryFromData(data, stockMeta = {}) {
  const name = stockMeta.name || data.name || data.code || "해당 종목";
  const code = data.code || stockMeta.code || "-";
  const market = stockMeta.market || data.market || "KOSPI/KOSDAQ";
  const favor = Number(data.favor_score || 0);
  const signal = data.signal || (favor >= 75 ? "상승 가능" : favor >= 55 ? "중립" : "주의");
  const tomorrowProb = Number(data.tomorrow_prob || 0);
  const valuation = favor >= 80 ? "밸류 부담이 꽤 있는 편" : favor >= 60 ? "적정~중립 구간" : "할인 인식 구간";
  const flowHint = data.foreign_flow || "외국인/기관 수급 방향은 추가 확인이 필요";
  const futureHint = data.future_outlook || "실적 가시성 확인 전까지는 보수적 점검이 필요";
  const riskHint = data.risk || "시장 변동성 확대 시 단기 낙폭이 커질 수 있음";

  return [
    "🏢 이 회사 뭐 하는 곳인가",
    `${name}(${code})은 ${market}에서 거래되는 종목으로, 주가의 핵심은 업황과 실적 체력의 결합입니다.`,
    "겉으로는 테마주처럼 보일 수 있어도 결국 이익이 늘어나는 구조인지가 장기 방향을 결정합니다.",
    "시장에서는 단순 뉴스보다 수급과 실적 추정치 변화에 더 크게 반응하는 구간이 자주 나타납니다.",
    "이 종목은 무엇을 파는 회사인지보다, 어떤 조건에서 이익 레버리지가 붙는지 확인하셔야 합니다.",
    "핵심은 스토리 자체보다 숫자로 증명되는 사업 체력입니다.",
    "",
    "📈 왜 오를 수 있나",
    `현재 신호는 ${signal}, AI 점수는 ${favor}점으로 완전 약세보다는 반등 논리가 살아 있는 자리입니다.`,
    tomorrowProb ? `내일 상승 확률 추정치가 ${tomorrowProb}%로 제시되어 단기 모멘텀 기대가 유지됩니다.` : "단기 확률 수치는 제한적이지만 모멘텀 자체는 유효합니다.",
    `수급 측면에서는 ${flowHint}라는 해석이 가능해 거래대금이 동반되면 탄력이 커질 수 있습니다.`,
    `전망 측면에서는 ${futureHint} 흐름이 확인될 경우 밸류 재평가 여지가 생깁니다.`,
    "즉 오를 이유는 분명하지만, 시장이 이를 즉시 가격에 반영하는지는 별도로 확인하셔야 합니다.",
    "",
    "⚠️ 뭐가 위험한가",
    "좋은 회사여도 기대가 앞서가면 실적 발표 시점에 차익 매물이 강하게 나올 수 있습니다.",
    "업황 회복이 늦어지면 현재 상승 논리의 약한 고리가 먼저 흔들릴 가능성이 높습니다.",
    `${riskHint} 포인트는 특히 지수 조정장에서 체감 리스크가 커질 수 있습니다.`,
    "테마 과열 구간에서는 회사 펀더멘털과 무관하게 변동성만 커져 손익이 왜곡되기 쉽습니다.",
    "결국 리스크는 회사가 나빠서가 아니라 기대치와 현실의 간격에서 발생하는 경우가 많습니다.",
    "",
    "💰 지금 가격이 싼가 비싼가",
    `현재 점수 체계로 보면 절대 저평가 단정보다 ${valuation}으로 해석하는 편이 현실적입니다.`,
    "많이 오른 것처럼 보여도 이익 추정 상향이 계속되면 비싸 보이는 가격이 정당화될 수 있습니다.",
    "반대로 싸 보이는 자리라도 할인 이유가 구조적이면 반등이 지연될 수 있습니다.",
    "그래서 숫자는 단순 레벨보다 시장 기대가 이미 얼마나 선반영됐는지가 중요합니다.",
    "지금 자리는 싸다/비싸다 이분법보다 부담을 관리하며 접근할 자리인지가 핵심입니다.",
    "",
    "🤔 그래서 지금 사도 되나",
    "지금은 한 번에 비중을 싣기보다 분할 접근으로 리스크를 관리하는 구간입니다.",
    "단기라면 추격매수보다 눌림에서 거래량 재유입을 확인하고 대응하는 전략이 유리합니다.",
    "중기라면 실적 확인 이벤트를 통과하면서 비중을 단계적으로 늘리는 방식이 더 안정적입니다.",
    "신호가 살아 있어도 변동성은 열려 있으니 손절·비중 규칙을 먼저 정하고 접근하셔야 합니다.",
    "좋은 회사라고 아무 가격에 사는 자리는 아닙니다. 지금 자리는 확신보다 리스크 관리가 먼저입니다."
  ].join("\n");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findNewsLinkForSummaryLine(code, line) {
  const text = String(line || "").trim();
  if (!code || !text) return "";
  const items = Array.isArray(cacheState.newsMap?.[code]) ? cacheState.newsMap[code] : [];
  const titleOnly = text.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").replace(/^['"]|['"]$/g, "");
  const hit = items.find((item) => {
    const itemTitle = String(item?.title || "").trim();
    return itemTitle && (text.includes(itemTitle) || titleOnly.includes(itemTitle) || itemTitle.includes(titleOnly));
  });
  return String(hit?.link || "");
}

function renderSummaryHtml(summary, code = "") {
  const headingSet = new Set([
    "이 회사 뭐 하는 곳인가",
    "왜 오를 수 있나",
    "뭐가 위험한가",
    "지금 가격이 싼가 비싼가",
    "그래서 지금 사도 되나"
  ]);
  const lines = String(summary || "").split("\n");
  return lines
    .map((line) => {
      const t = line.trim();
      if (!t) return '<div class="summary-gap"></div>';
      const noEmoji = t.replace(/^[🏢📈⚠️💰🤔]\s*/, "").trim();
      if (/^[🏢📈⚠️💰🤔]\s/.test(t) || headingSet.has(noEmoji)) {
        return `<div class="summary-heading">${escapeHtml(t)}</div>`;
      }
      if (/^\d{4}-\d{2}-\d{2}\s+['"].+['"]/.test(t)) {
        const href = findNewsLinkForSummaryLine(code, t);
        const text = escapeHtml(t);
        if (href) {
          return `<div class="summary-news-title"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a></div>`;
        }
        return `<div class="summary-news-title">${text}</div>`;
      }
      if (t.startsWith("-> ")) {
        const boldHtml = escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return `<div class="summary-news-explain">${boldHtml}</div>`;
      }
      const boldHtml = escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return `<div class="summary-line">${boldHtml}</div>`;
    })
    .join("");
}

function probBar(p) {
  const v = clamp(Number(p || 0), 0, 100);
  const full = Math.round(v / 10);
  return `${"█".repeat(full)}${"░".repeat(10 - full)} ${v}%`;
}

function probGaugeHtml(p, tone = "blue") {
  const v = clamp(Number(p || 0), 0, 100);
  return `
    <span class="prob-gauge ${tone}">
      <span class="prob-gauge-value">${v}%</span>
      <span class="prob-gauge-track"><span style="width:${v}%"></span></span>
    </span>
  `;
}

function getLogoUrl(code, name = "", explicit = "") {
  if (explicit) return explicit;
  if (/^\d{6}$/.test(String(code || ""))) return `/data/logos/${code}.png`;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || code || "stock")}&background=0B1F3A&color=ffffff&rounded=true&size=128`;
}

function decisionClass(signal) {
  if (signal === "상승 가능") return "buy";
  if (signal === "주의") return "sell";
  return "hold";
}

function renderList(el, items) {
  el.innerHTML = (items || []).map((item) => {
    if (item && typeof item === "object" && item.type === "news") {
      const text = escapeHtml(item.text || item.title || "");
      const href = String(item.link || "").trim();
      if (href) {
        return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a></li>`;
      }
      return `<li>${text}</li>`;
    }
    return `<li>${escapeHtml(String(item || ""))}</li>`;
  }).join("");
}

function getShareUrl() {
  return window.location.href;
}

function setShareStatus(text) {
  if (!els.shareStatus) return;
  els.shareStatus.textContent = text;
  clearTimeout(setShareStatus._t);
  setShareStatus._t = setTimeout(() => {
    if (els.shareStatus) els.shareStatus.textContent = "";
  }, 1800);
}

async function copyUrlToClipboard() {
  const url = getShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    setShareStatus("URL 복사 완료");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setShareStatus("URL 복사 완료");
  }
}

function openShareWindow(url) {
  window.open(url, "_blank", "noopener,noreferrer,width=640,height=720");
}

function handleShare(platform) {
  const url = encodeURIComponent(getShareUrl());
  const text = encodeURIComponent("LuckyStock AI 종목 분석");

  if (platform === "twitter") {
    openShareWindow(`https://twitter.com/intent/tweet?text=${text}&url=${url}`);
    return;
  }
  if (platform === "telegram") {
    openShareWindow(`https://t.me/share/url?url=${url}&text=${text}`);
    return;
  }
  if (platform === "kakao") {
    openShareWindow(`https://story.kakao.com/share?url=${url}`);
    return;
  }
  if (platform === "instagram") {
    copyUrlToClipboard();
    openShareWindow("https://www.instagram.com/");
    return;
  }
  if (platform === "copy") {
    copyUrlToClipboard();
  }
}

function setSearchLoading(active) {
  if (!els.searchLoading) return;
  if (active) els.searchLoading.removeAttribute("hidden");
  else els.searchLoading.setAttribute("hidden", "");
}

function showResultPanel() {
  if (els.resultPanel) els.resultPanel.classList.remove("hidden");
}

function scrollToResult() {
  if (!els.resultPanel) return;
  els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initEmptyResultState() {
  if (!els.resultPanel) return;
  els.resultPanel.classList.add("hidden");
  els.companyName.textContent = "-";
  els.companyCode.textContent = "-";
  if (els.stockPageLinkTop) els.stockPageLinkTop.href = "/";
  els.aiDecision.textContent = "-";
  els.aiConfidence.textContent = "-";
  els.catalystScore.textContent = "-";
  els.decisionDesc.textContent = "종목을 검색하면 분석 결과가 표시됩니다.";
}

function updateResultUrl(code) {
  if (!code || suppressUrlUpdate) return;
  history.replaceState({}, "", `/stock/${code}`);
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`api_error_${res.status}`);
  return res.json();
}

async function loadStaticCache() {
  if (cacheState.loaded) return cacheState;

  const [ac, amap, top, recent, themes, news, naverPopular, homeToday, homeTomorrow, homeSignal] = await Promise.all([
    fetch("/data/ui_autocomplete.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_analysis_map.json").then((r) => (r.ok ? r.json() : { map: {} })).catch(() => ({ map: {} })),
    fetch("/data/ui_top_stocks.json").then((r) => (r.ok ? r.json() : { top: [] })).catch(() => ({ top: [] })),
    fetch("/data/ui_recent_analysis.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_theme_ranking.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_news_map.json").then((r) => (r.ok ? r.json() : { map: {} })).catch(() => ({ map: {} })),
    fetch("/data/ui_naver_popular.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_home_today.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_home_tomorrow.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_home_signal.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }))
  ]);

  cacheState.autocomplete = Array.isArray(ac.items) ? ac.items : [];
  cacheState.analysisMap = amap.map || {};
  cacheState.top = Array.isArray(top.top) ? top.top : [];
  cacheState.recent = Array.isArray(recent.items) ? recent.items : [];
  cacheState.themes = Array.isArray(themes.items) ? themes.items : [];
  cacheState.newsMap = news.map || {};
  cacheState.homeToday = Array.isArray(homeToday.items) ? homeToday.items : [];
  cacheState.homeTomorrow = Array.isArray(homeTomorrow.items) ? homeTomorrow.items : [];
  cacheState.homeSignal = Array.isArray(homeSignal.items) ? homeSignal.items : [];
  cacheState.naverPopular = Array.isArray(naverPopular.items) ? naverPopular.items : [];
  cacheState.naverPopularMap = Object.fromEntries(cacheState.naverPopular.map((item) => [item.code, item]));
  cacheState.loaded = true;
  return cacheState;
}

function buildNaverPopularReason(popularItem, data, stockMeta = {}, newsItems = []) {
  if (!popularItem) return "";

  const lines = [];
  const rankText = popularItem.rank ? `네이버 금융 인기종목 ${popularItem.rank}위` : "네이버 금융 인기종목";
  const direction = String(popularItem.direction || "변동");
  const theme = data.theme || stockMeta.theme || "";
  const titles = Array.isArray(newsItems) ? newsItems.slice(0, 2).map((item) => item.title).filter(Boolean) : [];

  lines.push(`<p class="rationale-title"><strong>네이버 금융 인기종목 이유 추정</strong></p>`);
  lines.push(`<ul class="rationale-list">`);
  lines.push(`<li>${rankText}에 오른 만큼 오늘 실제 사용자 관심이 많이 몰린 종목으로 볼 수 있습니다.</li>`);

  if (direction === "상승") {
    lines.push(`<li>당일 주가가 강하게 움직인 종목은 네이버 금융에서 조회가 급증하면서 인기종목 상위로 올라오는 경우가 많습니다.</li>`);
  } else if (direction === "하락") {
    lines.push(`<li>하락 또는 악재 해석이 붙은 종목도 투자자들이 확인하려 몰리면서 인기종목으로 빠르게 올라올 수 있습니다.</li>`);
  } else {
    lines.push(`<li>주가 방향보다 뉴스·이슈·향후 흐름을 확인하려는 수요가 몰렸을 가능성이 큽니다.</li>`);
  }

  if (titles.length) {
    lines.push(`<li>최근 기사 기준으로는 '${escapeHtml(titles[0])}'${titles[1] ? `, '${escapeHtml(titles[1])}'` : ""} 같은 이슈를 확인하려는 수요가 붙었을 가능성이 있습니다.</li>`);
  } else if (theme) {
    lines.push(`<li>${escapeHtml(theme)} 관련 종목군 흐름을 확인하려는 과정에서 관심이 집중됐을 가능성이 있습니다.</li>`);
  } else {
    lines.push(`<li>대표 종목이거나 시장에서 언급량이 늘면서 자연스럽게 조회가 몰렸을 가능성이 있습니다.</li>`);
  }

  lines.push(`</ul>`);
  return lines.join("");
}

function buildRankingReason(context, data, stockMeta = {}) {
  const name = stockMeta.name || data.name || data.code || "해당 종목";
  const signalEmoji = getSignalEmoji(data.signal, data.signal_emoji || "");
  const favor = Number(data.favor_score || 0);
  const tomorrowProb = Number(data.tomorrow_prob || 0);
  const triggerCount = Number(data.trigger_count || 0);
  const p1 = Number(data.prob_1m || 0);
  const p3 = Number(data.prob_3m || 0);
  const rankScore = Number(data.rank_score || favor);

  const lines = [];

  if (context.source === "today") {
    lines.push(`<p class="rationale-title"><strong>오늘 AI 발견 급등주 선정 이유</strong></p>`);
    lines.push(`<ul class="rationale-list">`);
    lines.push(`<li>${name}은 현재 상위 랭크 점수 ${rankScore}점으로 오늘 AI 발견 급등주 상단에 오른 종목입니다.</li>`);
    lines.push(`<li>AI 분석 점수(100점 만점) ${favor}점과 ${signalEmoji} ${data.signal} 신호가 같이 높게 잡혀, 오늘 바로 눈에 띄는 강세 후보로 분류됐습니다.</li>`);
    lines.push(`<li>단기 급등주 카드에서는 내일 확률보다 현재 점수, 신호, 모멘텀 조합을 더 강하게 반영합니다.</li>`);
    lines.push(`</ul>`);
    return lines.join("");
  }

  if (context.source === "tomorrow") {
    lines.push(`<p class="rationale-title"><strong>AI 급등 가능성 추천 TOP10 선정 이유</strong></p>`);
    lines.push(`<ul class="rationale-list">`);
    lines.push(`<li>${name}은 내일 상승 확률 ${tomorrowProb}%로 계산돼, 내일 기준 상위 예측 후보군에 포함된 종목입니다.</li>`);
    lines.push(`<li>이 리스트는 당장 오늘 강세보다, 다음 거래일에 반응이 이어질 가능성을 더 중점적으로 봅니다.</li>`);
    lines.push(`<li>즉 지금 클릭 의미는 "오늘 왜 뜨는가"보다 "내일도 힘이 이어질 수 있는가"를 확인하는 데 있습니다.</li>`);
    lines.push(`</ul>`);
    return lines.join("");
  }

  if (context.source === "signal") {
    lines.push(`<p class="rationale-title"><strong>실시간 AI 투자 신호 선정 이유</strong></p>`);
    lines.push(`<ul class="rationale-list">`);
    lines.push(`<li>${name}은 현재 Signal ${triggerCount}개 충족 상태라 실시간 AI 투자 신호 영역에 노출된 종목입니다.</li>`);
    lines.push(`<li>이 카드는 종합 점수보다도 뉴스, 수급, 기술, 거래량 같은 세부 신호가 몇 개 동시에 살아 있는지를 보여주는 용도입니다.</li>`);
    lines.push(`<li>즉 이 영역에 뜬다는 건 "한 가지 이유"보다 여러 신호가 동시에 맞물리고 있다는 뜻에 가깝습니다.</li>`);
    lines.push(`</ul>`);
    return lines.join("");
  }

  if (context.source === "ranked") {
    lines.push(`<p class="rationale-title"><strong>상위 랭킹 선정 이유</strong></p>`);
    lines.push(`<ul class="rationale-list">`);
    lines.push(`<li>${name}은 현재 종합 랭크 점수 ${rankScore}점으로 상위 후보군에 포함된 종목입니다.</li>`);
    lines.push(`<li>AI 분석 점수(100점 만점) ${favor}점, 1개월 ${p1}%, 3개월 ${p3}% 확률, ${signalEmoji} ${data.signal} 신호를 함께 반영한 결과입니다.</li>`);
    lines.push(`<li>상세에서는 왜 점수가 나왔는지, 그 근거가 실제 투자 판단으로 이어질 만한지까지 같이 보는 게 맞습니다.</li>`);
    lines.push(`</ul>`);
    return lines.join("");
  }

  return "";
}

function renderSignalCards(data) {
  const flags = Array.isArray(data.signal_flags) && data.signal_flags.length
    ? data.signal_flags
    : [
        { label: "뉴스 증가", desc: "모멘텀 상회", active: true },
        { label: "외국인 매수", desc: "수급 상회", active: true },
        { label: "기관 매수", desc: "기관 수급 상회", active: false },
        { label: "기술적 돌파", desc: "차트 신호", active: true },
        { label: "테마 모멘텀", desc: "테마 점수", active: true },
        { label: "거래량 급증", desc: "유동성 신호", active: false }
      ];

  const activeCount = flags.filter((f) => f.active).length;
  const signalEmoji = getSignalEmoji(data.signal, data.signal_emoji || "");

  els.signalSummary.innerHTML = `<span class="signal-strong">Signal ${activeCount}개 충족</span> · ${signalEmoji} ${data.signal}`;
  els.signalVisual.innerHTML = flags
    .slice(0, 6)
    .map(
      (s) => `
      <div class="signal-item ${s.active ? "active" : "inactive"}">
        <div class="signal-icon">${s.active ? "✓" : "·"}</div>
        <div>
          <strong>${s.label}</strong>
          <small>${s.desc || "AI 시그널"}</small>
        </div>
        <div class="signal-right">
          <span class="signal-state ${s.active ? "on" : "off"}">${s.active ? "충족" : "미충족"}</span>
          <div class="signal-meter"><span style="width:${s.active ? 100 : 20}%"></span></div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderDecisionFromData(data, stockMeta = {}, context = {}) {
  const code = data.code;
  const name = stockMeta.name || code;
  const market = stockMeta.market || "KOSPI/KOSDAQ";
  const price = Number(data.close_price ?? stockMeta.close_price ?? 0) || null;
  const favor = Number(data.favor_score || 0);
  const signalEmoji = getSignalEmoji(data.signal, data.signal_emoji || "");

  const p1 = Number(data.prob_1m || 60);
  const p3 = Number(data.prob_3m || 70);
  const py = Number(data.prob_1y || 78);
  const tomorrowProb = Number(data.tomorrow_prob || clamp(Math.round(p1 + 5), 40, 90));
  const triggerCount = Number(data.trigger_count || 4);
  const confidence = Number(data.confidence || clamp(Math.round(45 + favor * 0.5), 45, 95));

  els.companyLogo.src = getLogoUrl(code, name, data.logo_url || stockMeta.logo_url || "");
  els.companyLogo.alt = `${name} 로고`;
  els.companyLogo.onerror = () => {
    els.companyLogo.src = `/data/logos/${code}.svg`;
  };

  els.companyName.textContent = name;
  els.companyCode.textContent = `${code} · ${market}${price ? ` · ${formatNumber(price)}원` : ""}`;
  if (els.stockPageLinkTop) {
    els.stockPageLinkTop.href = `/stock/${code}`;
    els.stockPageLinkTop.textContent = `📄 ${name} 전용 분석 페이지 →`;
  }

  els.aiDecision.textContent = `${signalEmoji} ${data.signal}`;
  els.aiDecision.className = `decision ${decisionClass(data.signal)}`;
  els.decisionGuide.textContent = data.cache_hit ? "DB 캐시 결과" : "AI 신규 분석 결과";
  els.aiConfidence.textContent = `${confidence}%`;
  els.catalystScore.textContent = `100점 만점에 ${favor}점`;
  const summaryText = (typeof data.summary === "string" && data.summary.includes("🏢 이 회사 뭐 하는 곳인가"))
    ? data.summary
    : buildFiveQaSummaryFromData(data, stockMeta);
  els.decisionDesc.innerHTML = renderSummaryHtml(summaryText || "분석 요약 없음", code);

  const buyReasons = Array.isArray(data.bull_points) ? data.bull_points : [
    `🔥 지금 사는 이유: AI 분석 점수(100점 만점) ${favor}점으로 상단권`,
    `✅ 수급/모멘텀 결합 신호가 강화`,
    `🚀 내일 상승 확률 ${tomorrowProb}% 기대`
  ];
  renderList(els.buyReasons, buyReasons.slice(0, 3));

  const riskPoints = Array.isArray(data.risk_points) ? data.risk_points : [
    `⚠️ 단기 급등 구간 변동성 확대 가능성`,
    `⚠️ 매크로 변수(금리/환율/지수) 리스크`,
    `⚠️ 거래대금 둔화 시 추세 약화 가능성`
  ];
  renderList(els.riskPoints, riskPoints.slice(0, 3));

  els.prob1m.innerHTML = probGaugeHtml(p1, "blue");
  els.prob3m.innerHTML = probGaugeHtml(p3, "teal");
  els.prob1y.innerHTML = probGaugeHtml(py, "gold");

  els.flowTable.innerHTML = `
    <div class="flow-row">
      <div class="flow-row-top"><span>내일 상승 확률</span><span>${tomorrowProb}%</span></div>
      <div class="flow-values">${probGaugeHtml(tomorrowProb, "blue")}</div>
    </div>
    <div class="flow-row">
      <div class="flow-row-top"><span>실시간 AI 투자 신호</span><span>${signalEmoji} ${data.signal}</span></div>
      <div class="flow-values"><strong class="inst">Signal ${triggerCount}개 충족</strong></div>
    </div>
  `;

  els.techHighDiff.textContent = `${-Math.round(clamp(100 - p1, 4, 30))}%`;
  els.techSupport.textContent = formatNumber(Math.round((price || 50000) * 0.92));
  els.techResistance.textContent = formatNumber(Math.round((price || 50000) * 1.12));

  els.valuationBadge.textContent = favor >= 80 ? "고평가" : favor >= 60 ? "적정" : "저평가";
  els.valuationDesc.textContent = data.future_outlook || "전망 데이터 없음";

  els.scoreBreakdown.innerHTML = [
    ["AI 분석 점수", favor],
    ["투자 신호", `${signalEmoji} ${data.signal}`],
    ["Signal 충족", `${triggerCount}개`]
  ].map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");

  renderSignalCards(data);

  const newsItems = (cacheState.newsMap && cacheState.newsMap[code]) ? cacheState.newsMap[code] : [];
  if (Array.isArray(newsItems) && newsItems.length) {
    els.newsList.innerHTML = newsItems.slice(0, 5).map((n) => `<li><span><a href="${n.link}" target="_blank" rel="noopener noreferrer">${n.title}</a></span><span class="rank-meta">${(n.date || "").slice(0, 16)}</span></li>`).join("");
  } else {
    els.newsList.innerHTML = `<li><span>관련 최신 뉴스가 아직 수집되지 않았습니다.</span><span class="rank-meta">${(data.updated_at || "").slice(0, 10)}</span></li>`;
  }
  const naverPopularItem = context.source === "naver_popular" ? cacheState.naverPopularMap[code] : null;
  const naverPopularHtml = buildNaverPopularReason(naverPopularItem, data, stockMeta, newsItems);
  const rankingReasonHtml = buildRankingReason(context, data, stockMeta);

  els.clickedRationale.innerHTML = `
    ${naverPopularHtml}
    ${rankingReasonHtml}
    <p class="rationale-title"><strong>${name} 판단 근거</strong></p>
    <ul class="rationale-list">
      <li>AI 분석 점수(100점 만점) ${favor}점 · ${signalEmoji} ${data.signal}</li>
      <li>내일 상승 확률 ${tomorrowProb}%</li>
      <li>Signal ${triggerCount}개 충족</li>
      <li>미래 전망: ${data.future_outlook || "-"}</li>
    </ul>
    <a href="/stock/${code}" class="stock-page-link">📄 ${name} 전용 분석 페이지 바로가기 →</a>
  `;
}

async function resolveStockByQuery(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  if (/^\d{6}$/.test(q)) {
    try {
      const ac = await apiGet(`/api/autocomplete?q=${encodeURIComponent(q)}`);
      const items = Array.isArray(ac?.items) ? ac.items : [];
      const exact = items.find((x) => String(x.code || "") === q);
      if (exact) {
        return {
          code: String(exact.code || q),
          name: String(exact.name || exact.code || q),
          market: String(exact.market || "KOSPI/KOSDAQ"),
          close_price: Number(exact.close_price || 0) || null,
          logo_url: String(exact.logo_url || "")
        };
      }
    } catch {}

    const cache = await loadStaticCache();
    const exact = cache.autocomplete.find((x) => String(x.code || "") === q);
    if (exact) {
      return {
        code: String(exact.code || q),
        name: String(exact.name || exact.code || q),
        market: String(exact.market || "KOSPI/KOSDAQ"),
        close_price: Number(exact.close_price || 0) || null,
        logo_url: String(exact.logo_url || "")
      };
    }

    return { code: q, name: q, market: "KOSPI/KOSDAQ" };
  }

  let items = [];
  try {
    const ac = await apiGet(`/api/autocomplete?q=${encodeURIComponent(q)}`);
    items = Array.isArray(ac?.items) ? ac.items : [];
  } catch {
    const cache = await loadStaticCache();
    items = cache.autocomplete.filter((x) => normalize(x.name).includes(normalize(q)) || String(x.code || "").includes(q));
  }

  if (!items.length) return null;
  const exact = items.find((x) => normalize(x.name) === normalize(q));
  const pick = exact || items[0];
  return {
    code: String(pick.code || ""),
    name: String(pick.name || pick.code || ""),
    market: String(pick.market || "KOSPI/KOSDAQ"),
    close_price: Number(pick.close_price || 0) || null,
    logo_url: String(pick.logo_url || "")
  };
}

async function searchAndRender(query, context = { source: "search" }) {
  const q = String(query || "").trim();
  if (!q) return;

  setSearchLoading(true);
  try {
    const stock = await resolveStockByQuery(q);
    if (!stock?.code) {
      showResultPanel();
      els.decisionDesc.textContent = "종목을 찾지 못했습니다. 예: 삼성전자, 005930";
      return;
    }

    let data;
    try {
      data = await apiGet(`/api/analyze?code=${encodeURIComponent(stock.code)}`);
    } catch {
      const cache = await loadStaticCache();
      data = cache.analysisMap[stock.code];
      if (!data) throw new Error("analysis_cache_miss");
    }

    showResultPanel();
    updateResultUrl(stock.code);
    currentSelectionContext = context || { source: "search" };
    renderDecisionFromData(data, stock, currentSelectionContext);
    scrollToResult();
  } catch {
    showResultPanel();
    els.decisionDesc.textContent = "분석 API 연결에 실패했습니다. 백엔드 상태를 확인해주세요.";
  } finally {
    setSearchLoading(false);
  }
}

async function renderAutocomplete(keyword) {
  const q = normalize(keyword);
  if (!q) {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
    return;
  }

  const currentSeq = ++autoCompleteSeq;
  try {
    let items = [];
    try {
      const data = await apiGet(`/api/autocomplete?q=${encodeURIComponent(q)}`);
      items = Array.isArray(data?.items) ? data.items : [];
    } catch {
      const cache = await loadStaticCache();
      items = cache.autocomplete.filter((x) => normalize(x.name).includes(q) || String(x.code || "").includes(q));
    }

    if (currentSeq !== autoCompleteSeq) return;
    items = items.slice(0, AUTO_COMPLETE_LIMIT);

    if (!items.length) {
      els.autoList.classList.remove("active");
      els.autoList.innerHTML = "";
      return;
    }

    els.autoList.innerHTML = items
      .map((s) => `<li data-key="${s.code}"><span class="rank-name">${s.name} (${s.code})</span><span class="rank-meta">${s.market || "-"}</span></li>`)
      .join("");
    els.autoList.classList.add("active");
  } catch {
    els.autoList.classList.remove("active");
    els.autoList.innerHTML = "";
  }
}

function renderRankCard(a, idx, mode) {
  const signalEmoji = getSignalEmoji(a.signal, a.signal_emoji || "");
  const logo = getLogoUrl(a.code, a.name || a.code, a.logo_url || "");

  if (mode === "today") {
    return `
      <div class="rank-item clickable" data-code="${a.code}">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="${logo}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
            <span class="rank-name">${idx + 1}위 ${a.name || a.code}</span>
          </div>
          <strong>${a.favor_score}점</strong>
        </div>
        <div class="rank-meta"><span class="emph-catalyst">AI 분석 점수(100점 만점) ${a.favor_score}점</span> · ${signalEmoji} ${a.signal || "중립"}</div>
      </div>
    `;
  }

  if (mode === "tomorrow") {
    return `
      <div class="rank-item clickable" data-code="${a.code}">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="${logo}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
            <span class="rank-name">${idx + 1}. ${a.name || a.code}</span>
          </div>
          <strong>${a.tomorrow_prob || 0}%</strong>
        </div>
        <div class="rank-meta"><span class="emph-prob">내일 상승 확률 ${a.tomorrow_prob || 0}%</span> · ${signalEmoji} ${a.signal || "중립"}</div>
      </div>
    `;
  }

  return "";
}

function uniqueByCode(items = []) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const code = String(item?.code || "");
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

function getTodaySurgeItems(cache) {
  if (Array.isArray(cache.homeToday) && cache.homeToday.length) return cache.homeToday.slice(0, 5);
  return uniqueByCode(
    [...cache.top]
      .sort((a, b) =>
        Number(b.rank_score || 0) - Number(a.rank_score || 0) ||
        Number(b.favor_score || 0) - Number(a.favor_score || 0) ||
        Number(b.tomorrow_prob || 0) - Number(a.tomorrow_prob || 0)
      )
  ).slice(0, 5);
}

function getTomorrowTopItems(cache) {
  if (Array.isArray(cache.homeTomorrow) && cache.homeTomorrow.length) return cache.homeTomorrow.slice(0, 10);
  const pool = cache.recent.length ? cache.recent : cache.top;
  return uniqueByCode(
    [...pool]
      .sort((a, b) =>
        Number(b.tomorrow_prob || 0) - Number(a.tomorrow_prob || 0) ||
        Number(b.prob_1m || 0) - Number(a.prob_1m || 0) ||
        Number(b.favor_score || 0) - Number(a.favor_score || 0)
      )
  ).slice(0, 10);
}

function getSignalFeedItems(cache) {
  if (Array.isArray(cache.homeSignal) && cache.homeSignal.length) return cache.homeSignal.slice(0, 6);
  const signalWeight = (item) => {
    if (item.signal === "상승 가능") return 3;
    if (item.signal === "중립") return 2;
    return 1;
  };
  const pool = cache.recent.length ? cache.recent : cache.top;
  return uniqueByCode(
    [...pool]
      .filter((item) =>
        Number(item.trigger_count || 0) >= 4 &&
        item.signal === "상승 가능" &&
        Number(item.favor_score || 0) >= 60
      )
      .sort((a, b) =>
        Number(b.trigger_count || 0) - Number(a.trigger_count || 0) ||
        signalWeight(b) - signalWeight(a) ||
        Number(b.confidence || 0) - Number(a.confidence || 0) ||
        Number(b.favor_score || 0) - Number(a.favor_score || 0)
      )
  ).slice(0, 6);
}

async function initHomeWidgets() {
  if (els.todayHeadline) els.todayHeadline.textContent = "오늘 AI 발견 급등주";
  if (els.tomorrowHeadline) els.tomorrowHeadline.textContent = "AI 급등 가능성 추천 TOP10";

  try {
    const cache = await loadStaticCache();
    const todayItems = getTodaySurgeItems(cache);
    const tomorrowItems = getTomorrowTopItems(cache);
    const signalItems = getSignalFeedItems(cache);
    const themes = cache.themes.slice(0, 5);

    els.todaySurgeList.innerHTML = todayItems.map((a, idx) => renderRankCard(a, idx, "today")).join("");
    els.tomorrowTop10.innerHTML = tomorrowItems.map((a, idx) => renderRankCard(a, idx, "tomorrow")).join("");

    els.signalFeed.innerHTML = signalItems.map((a) => `
      <div class="feed-item clickable" data-code="${a.code}">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
          <strong>${a.name || a.code}</strong>
        </div>
        <div class="rank-meta"><span class="signal-strong">Signal ${a.trigger_count || 0}개 충족</span> · ${getSignalEmoji(a.signal, a.signal_emoji || "")} ${a.signal || "중립"}</div>
      </div>
    `).join("");

    const popularItems = cache.naverPopular.slice(0, 10);
    els.popularList.innerHTML = popularItems.map((a) => `
      <div class="feed-item clickable" data-code="${a.code}">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
          <strong>${a.rank || "-"}. ${a.name || a.code}</strong>
        </div>
        <div class="rank-meta">${a.code} · 네이버 금융 인기종목${a.price_text ? ` · ${a.price_text}` : ""}${a.direction ? ` · ${a.direction}` : ""}</div>
      </div>
    `).join("");

    els.themeFeed.innerHTML = themes.map((t) => `
      <div class="feed-item">
        <strong>${t.theme} 테마</strong>
        <div class="rank-meta">평균 AI 분석 점수 ${t.avg_score}</div>
      </div>
    `).join("");
  } catch {
    els.todaySurgeList.innerHTML = `<div class="rank-item">랭킹 API 연결 실패</div>`;
    els.tomorrowTop10.innerHTML = `<div class="rank-item">랭킹 API 연결 실패</div>`;
    els.signalFeed.innerHTML = `<div class="feed-item">신호 API 연결 실패</div>`;
    els.popularList.innerHTML = `<div class="feed-item">네이버 금융 인기종목 연결 실패</div>`;
    els.themeFeed.innerHTML = `<div class="feed-item">테마 API 연결 실패</div>`;
  }
}

function initQuickTags() {
  els.quickTags.innerHTML = QUICK_TAGS.map((q) => `<button type="button" data-q="${q}">${q}</button>`).join("");
}

function initRankingClicks() {
  const onClick = (e) => {
    const item = e.target.closest(".rank-item.clickable, .feed-item.clickable");
    if (!item) return;
    const code = item.dataset.code;
    if (!code) return;
    document.querySelectorAll(".rank-item.clickable.active, .feed-item.clickable.active").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    let source = "ranked";
    if (item.closest("#today-surge-list")) source = "today";
    else if (item.closest("#tomorrow-top10")) source = "tomorrow";
    else if (item.closest("#signal-feed")) source = "signal";
    else if (item.closest("#popular-list")) source = "naver_popular";
    searchAndRender(code, { source });
  };

  els.todaySurgeList.addEventListener("click", onClick);
  els.tomorrowTop10.addEventListener("click", onClick);
  els.signalFeed.addEventListener("click", onClick);
  els.popularList.addEventListener("click", onClick);
}

function initEvents() {
  if (els.manualToggle && els.manualPanel) {
    els.manualToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (els.manualPanel.hasAttribute("hidden")) els.manualPanel.removeAttribute("hidden");
      else els.manualPanel.setAttribute("hidden", "");
    });
  }

  els.searchBtn.addEventListener("click", () => {
    searchAndRender(els.searchInput.value, { source: "search" });
    els.autoList.classList.remove("active");
  });

  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      searchAndRender(els.searchInput.value, { source: "search" });
      els.autoList.classList.remove("active");
    }
  });

  let timer = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => renderAutocomplete(els.searchInput.value), 180);
  });

  els.autoList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const code = li.dataset.key;
    els.searchInput.value = code;
    searchAndRender(code, { source: "autocomplete" });
    els.autoList.classList.remove("active");
  });

  els.quickTags.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const q = btn.dataset.q;
    els.searchInput.value = q;
    searchAndRender(q, { source: "quick_tag" });
  });

  document.addEventListener("click", (e) => {
    if (els.manualPanel && els.manualToggle && !els.manualPanel.hasAttribute("hidden") && !els.manualPanel.contains(e.target) && e.target !== els.manualToggle) {
      els.manualPanel.setAttribute("hidden", "");
    }
    if (!els.autoList.contains(e.target) && e.target !== els.searchInput) {
      els.autoList.classList.remove("active");
    }
  });

  if (els.shareCopyBtn) {
    els.shareCopyBtn.addEventListener("click", () => handleShare("copy"));
  }

  document.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleShare(btn.dataset.share);
    });
  });
}

function initFromUrl() {
  const url = new URL(window.location.href);
  // /stock/{code} 경로 또는 ?code= 파라미터 둘 다 지원
  const pathMatch = window.location.pathname.match(/^\/stock\/(\d{6})(?:\/.*)?$/);
  const code = (pathMatch && pathMatch[1]) || url.searchParams.get("code");
  if (!code) return;
  suppressUrlUpdate = true;
  searchAndRender(code, { source: "url" }).finally(() => {
    suppressUrlUpdate = false;
  });
}

initQuickTags();
initEvents();
initHomeWidgets();
initRankingClicks();
initEmptyResultState();
initFromUrl();
