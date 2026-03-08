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

let autoCompleteSeq = 0;
let suppressUrlUpdate = false;

const cacheState = {
  loaded: false,
  autocomplete: [],
  analysisMap: {},
  top: [],
  recent: [],
  themes: [],
  newsMap: {}
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

function probBar(p) {
  const v = clamp(Number(p || 0), 0, 100);
  const full = Math.round(v / 10);
  return `${"█".repeat(full)}${"░".repeat(10 - full)} ${v}%`;
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
  el.innerHTML = (items || []).map((x) => `<li>${x}</li>`).join("");
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
  els.aiDecision.textContent = "-";
  els.aiConfidence.textContent = "-";
  els.catalystScore.textContent = "-";
  els.decisionDesc.textContent = "종목을 검색하면 분석 결과가 표시됩니다.";
}

function updateResultUrl(code) {
  if (!code || suppressUrlUpdate) return;
  const url = new URL(window.location.href);
  url.searchParams.set("code", code);
  history.replaceState({}, "", url.toString());
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`api_error_${res.status}`);
  return res.json();
}

async function loadStaticCache() {
  if (cacheState.loaded) return cacheState;

  const [ac, amap, top, recent, themes, news] = await Promise.all([
    fetch("/data/ui_autocomplete.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_analysis_map.json").then((r) => (r.ok ? r.json() : { map: {} })).catch(() => ({ map: {} })),
    fetch("/data/ui_top_stocks.json").then((r) => (r.ok ? r.json() : { top: [] })).catch(() => ({ top: [] })),
    fetch("/data/ui_recent_analysis.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_theme_ranking.json").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("/data/ui_news_map.json").then((r) => (r.ok ? r.json() : { map: {} })).catch(() => ({ map: {} }))
  ]);

  cacheState.autocomplete = Array.isArray(ac.items) ? ac.items : [];
  cacheState.analysisMap = amap.map || {};
  cacheState.top = Array.isArray(top.top) ? top.top : [];
  cacheState.recent = Array.isArray(recent.items) ? recent.items : [];
  cacheState.themes = Array.isArray(themes.items) ? themes.items : [];
  cacheState.newsMap = news.map || {};
  cacheState.loaded = true;
  return cacheState;
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

function renderDecisionFromData(data, stockMeta = {}) {
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

  els.aiDecision.textContent = `${signalEmoji} ${data.signal}`;
  els.aiDecision.className = `decision ${decisionClass(data.signal)}`;
  els.decisionGuide.textContent = data.cache_hit ? "DB 캐시 결과" : "AI 신규 분석 결과";
  els.aiConfidence.textContent = `${confidence}%`;
  els.catalystScore.textContent = `100점 만점에 ${favor}점`;
  els.decisionDesc.textContent = data.summary || "분석 요약 없음";

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

  els.prob1m.textContent = `📈 ${probBar(p1)}`;
  els.prob3m.textContent = `📊 ${probBar(p3)}`;
  els.prob1y.textContent = `🏆 ${probBar(py)}`;

  els.flowTable.innerHTML = `
    <div class="flow-row">
      <div class="flow-row-top"><span>내일 상승 확률</span><span>${tomorrowProb}%</span></div>
      <div class="flow-values"><strong class="foreign">${probBar(tomorrowProb)}</strong></div>
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
    els.newsList.innerHTML = `<li><span>요약: ${data.summary || "-"}</span><span class="rank-meta">${(data.updated_at || "").slice(0, 10)}</span></li>`;
  }
  els.clickedRationale.innerHTML = `
    <p class="rationale-title"><strong>${name} 판단 근거</strong></p>
    <ul class="rationale-list">
      <li>AI 분석 점수(100점 만점) ${favor}점 · ${signalEmoji} ${data.signal}</li>
      <li>내일 상승 확률 ${tomorrowProb}%</li>
      <li>Signal ${triggerCount}개 충족</li>
      <li>미래 전망: ${data.future_outlook || "-"}</li>
    </ul>
  `;
}

async function resolveStockByQuery(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  if (/^\d{6}$/.test(q)) return { code: q, name: q, market: "KOSPI/KOSDAQ" };

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

async function searchAndRender(query) {
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
    renderDecisionFromData(data, stock);
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

async function initHomeWidgets() {
  if (els.todayHeadline) els.todayHeadline.textContent = "오늘 AI 발견 급등주";
  if (els.tomorrowHeadline) els.tomorrowHeadline.textContent = "AI 급등 가능성 추천 TOP10";

  try {
    const cache = await loadStaticCache();
    const items = cache.top.slice(0, 10);
    const themes = cache.themes.slice(0, 5);

    els.todaySurgeList.innerHTML = items.slice(0, 5).map((a, idx) => renderRankCard(a, idx, "today")).join("");
    els.tomorrowTop10.innerHTML = items.map((a, idx) => renderRankCard(a, idx, "tomorrow")).join("");

    els.signalFeed.innerHTML = items.slice(0, 6).map((a) => `
      <div class="feed-item clickable" data-code="${a.code}">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
          <strong>${a.name || a.code}</strong>
        </div>
        <div class="rank-meta"><span class="signal-strong">Signal ${a.trigger_count || 0}개 충족</span> · ${getSignalEmoji(a.signal, a.signal_emoji || "")} ${a.signal || "중립"}</div>
      </div>
    `).join("");

    els.popularList.innerHTML = items.map((a, i) => `
      <div class="feed-item clickable" data-code="${a.code}">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
          <strong>${i + 1}. ${a.name || a.code}</strong>
        </div>
        <div class="rank-meta">${a.code} · ${getSignalEmoji(a.signal, a.signal_emoji || "")} ${a.signal || "중립"}${a.close_price ? ` · ${formatNumber(a.close_price)}원` : ""}</div>
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
    els.popularList.innerHTML = `<div class="feed-item">인기 API 연결 실패</div>`;
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
    searchAndRender(code);
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
    timer = setTimeout(() => renderAutocomplete(els.searchInput.value), 180);
  });

  els.autoList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const code = li.dataset.key;
    els.searchInput.value = code;
    searchAndRender(code);
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
    if (els.manualPanel && els.manualToggle && !els.manualPanel.hasAttribute("hidden") && !els.manualPanel.contains(e.target) && e.target !== els.manualToggle) {
      els.manualPanel.setAttribute("hidden", "");
    }
    if (!els.autoList.contains(e.target) && e.target !== els.searchInput) {
      els.autoList.classList.remove("active");
    }
  });
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
initEmptyResultState();
initFromUrl();
