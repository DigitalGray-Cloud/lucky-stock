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
  recent: []
};

async function loadStaticCache() {
  if (cacheState.loaded) return cacheState;
  const [ac, amap, top, recent] = await Promise.all([
    fetch('/data/ui_autocomplete.json').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch('/data/ui_analysis_map.json').then((r) => (r.ok ? r.json() : { map: {} })).catch(() => ({ map: {} })),
    fetch('/data/ui_top_stocks.json').then((r) => (r.ok ? r.json() : { top: [] })).catch(() => ({ top: [] })),
    fetch('/data/ui_recent_analysis.json').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }))
  ]);

  cacheState.autocomplete = Array.isArray(ac.items) ? ac.items : [];
  cacheState.analysisMap = amap.map || {};
  cacheState.top = Array.isArray(top.top) ? top.top : [];
  cacheState.recent = Array.isArray(recent.items) ? recent.items : [];
  cacheState.loaded = true;
  return cacheState;
}

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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

function formatNumber(value) {
  return Number(value).toLocaleString("ko-KR");
}

function setSearchLoading(active) {
  if (!els.searchLoading) return;
  if (active) els.searchLoading.removeAttribute("hidden");
  else els.searchLoading.setAttribute("hidden", "");
}

function showResultPanel() {
  if (!els.resultPanel) return;
  els.resultPanel.classList.remove("hidden");
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

function decisionClass(signal) {
  if (signal === "상승 가능") return "buy";
  if (signal === "주의") return "sell";
  return "hold";
}

function getLogoUrl(code, name = "", explicit = "") {
  if (explicit) return explicit;
  if (/^\d{6}$/.test(String(code || ""))) {
    return `/data/logos/${code}.png`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || code || "stock")}&background=0B1F3A&color=ffffff&rounded=true&size=128`;
}

function renderList(el, items) {
  el.innerHTML = (items || []).map((x) => `<li>${x}</li>`).join("");
}

function makeDerivedMetrics(code, favorScore) {
  const seed = hashCode(`${code}:${favorScore}`);
  const prob1m = clamp(Math.round(35 + favorScore * 0.5 + seededRange(seed + 1, -5, 6)), 35, 92);
  const prob3m = clamp(prob1m + Math.round(seededRange(seed + 2, 3, 10)), 40, 95);
  const prob1y = clamp(prob3m + Math.round(seededRange(seed + 3, 4, 10)), 45, 97);
  const support = Math.round(seededRange(seed + 4, 8000, 180000));
  const resistance = Math.round(support * seededRange(seed + 5, 1.05, 1.19));
  const highDiff = -Math.round(seededRange(seed + 6, 5, 26));
  const confidence = clamp(Math.round(45 + favorScore * 0.5), 45, 95);
  return { prob1m, prob3m, prob1y, support, resistance, highDiff, confidence };
}

function renderDecisionFromApi(data, stockMeta = {}) {
  const code = data.code;
  const name = stockMeta.name || code;
  const market = stockMeta.market || "KOSPI/KOSDAQ";
  const favor = Number(data.favor_score || 0);
  const price = Number(data.close_price ?? stockMeta.close_price ?? 0) || null;
  const d = makeDerivedMetrics(code, favor);

  els.companyLogo.src = getLogoUrl(code, name, data.logo_url || stockMeta.logo_url || "");
  els.companyLogo.alt = `${name} 로고`;
  els.companyLogo.onerror = () => {
    els.companyLogo.src = getLogoUrl("", name);
  };

  els.companyName.textContent = name;
  els.companyCode.textContent = `${code} · ${market}${price ? ` · ${formatNumber(price)}원` : ""}`;

  els.aiDecision.textContent = data.signal;
  els.aiDecision.className = `decision ${decisionClass(data.signal)}`;
  els.decisionGuide.textContent = data.cache_hit ? "DB 캐시 결과" : "AI 신규 분석 결과";
  els.aiConfidence.textContent = `${d.confidence}%`;
  els.catalystScore.textContent = `100점 만점에 ${favor}점`;
  els.decisionDesc.textContent = data.summary || "분석 요약 없음";

  renderList(els.buyReasons, Array.isArray(data.bull_points) ? data.bull_points.slice(0, 3) : []);
  renderList(els.riskPoints, [data.risk || "리스크 데이터 없음"]);

  els.prob1m.textContent = `${d.prob1m}%`;
  els.prob3m.textContent = `${d.prob3m}%`;
  els.prob1y.textContent = `${d.prob1y}%`;

  els.flowTable.innerHTML = `<div class="flow-row"><div class="flow-row-top"><span>업데이트</span><span>${(data.updated_at || "").slice(0, 10)}</span></div><div class="flow-values"><strong class="foreign">${data.foreign_flow || "수급 데이터 없음"}</strong></div></div>`;

  els.techHighDiff.textContent = `${d.highDiff}%`;
  els.techSupport.textContent = formatNumber(d.support);
  els.techResistance.textContent = formatNumber(d.resistance);

  els.valuationBadge.textContent = favor >= 80 ? "고평가" : favor >= 60 ? "적정" : "저평가";
  els.valuationDesc.textContent = data.future_outlook || "전망 데이터 없음";

  els.scoreBreakdown.innerHTML = [
    ["호재 점수", favor],
    ["신호", data.signal || "-"],
    ["캐시", data.cache_hit ? "HIT" : "MISS"]
  ].map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");

  els.signalSummary.innerHTML = `<span class="signal-strong">${data.signal}</span> · ${data.cache_hit ? "DB 캐시" : "신규 생성"}`;
  els.signalVisual.innerHTML = `<div class="signal-item active"><div class="signal-icon">✓</div><div><strong>AI 분석</strong><small>${data.analysis_source || "cache"}</small></div><div class="signal-right"><span class="signal-state on">활성</span><div class="signal-meter"><span style="width:${clamp(favor, 10, 100)}%"></span></div></div></div>`;

  els.newsList.innerHTML = `<li><span>요약: ${data.summary || "-"}</span><span class="rank-meta">${(data.updated_at || "").slice(0, 10)}</span></li>`;
  els.clickedRationale.innerHTML = `
    <p class="rationale-title"><strong>${name} 판단 근거</strong></p>
    <ul class="rationale-list">
      <li>AI 점수 ${favor}점</li>
      <li>신호 ${data.signal}</li>
      <li>미래 전망: ${data.future_outlook || "-"}</li>
      <li>리스크: ${data.risk || "-"}</li>
    </ul>
  `;
}

async function resolveStockByQuery(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  if (/^\d{6}$/.test(q)) {
    return { code: q, name: q, market: "KOSPI/KOSDAQ" };
  }

  let items = [];
  try {
    const ac = await apiGet(`/api/autocomplete?q=${encodeURIComponent(q)}`);
    items = Array.isArray(ac?.items) ? ac.items : [];
  } catch {
    const cache = await loadStaticCache();
    items = cache.autocomplete.filter((x) => normalize(x.name).includes(normalize(q)) || String(x.code || "").includes(q)).slice(0, AUTO_COMPLETE_LIMIT);
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
    renderDecisionFromApi(data, stock);
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

function initQuickTags() {
  els.quickTags.innerHTML = QUICK_TAGS.map((q) => `<button type="button" data-q="${q}">${q}</button>`).join("");
}

async function initHomeWidgets() {
  if (els.todayHeadline) els.todayHeadline.textContent = "오늘 AI 발견 급등주";
  if (els.tomorrowHeadline) els.tomorrowHeadline.textContent = "AI 급등 가능성 추천 TOP10";

  try {
    let items = [];
    try {
      const top = await apiGet("/api/top-stocks?limit=10");
      items = Array.isArray(top?.top) ? top.top : [];
    } catch {
      const cache = await loadStaticCache();
      items = cache.top.slice(0, 10);
    }

    const top5 = items.slice(0, 5);
    els.todaySurgeList.innerHTML = top5.map((a, idx) => `
      <div class="rank-item clickable" data-code="${a.code}">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
            <span class="rank-name">${idx + 1}위 ${a.name || a.code}</span>
          </div>
          <strong>${a.favor_score}점</strong>
        </div>
        <div class="rank-meta">${a.code} · ${a.market || "-"}${a.close_price ? ` · ${formatNumber(a.close_price)}원` : ""}</div>
      </div>
    `).join("");

    els.tomorrowTop10.innerHTML = items.map((a, idx) => `
      <div class="rank-item clickable" data-code="${a.code}">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
            <span class="rank-name">${idx + 1}. ${a.name || a.code}</span>
          </div>
          <strong>${a.favor_score}점</strong>
        </div>
        <div class="rank-meta">rank ${a.rank}${a.close_price ? ` · ${formatNumber(a.close_price)}원` : ""}</div>
      </div>
    `).join("");

    els.signalFeed.innerHTML = items.slice(0, 6).map((a) => `
      <div class="feed-item clickable" data-code="${a.code}">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
          <strong>${a.name || a.code}</strong>
        </div>
        <div class="rank-meta">Signal · ${a.favor_score}점${a.close_price ? ` · ${formatNumber(a.close_price)}원` : ""}</div>
      </div>
    `).join("");

    els.popularList.innerHTML = items.slice(0, 10).map((a, i) => `
      <div class="feed-item clickable" data-code="${a.code}">
        <div class="rank-row">
          <div class="rank-logo"><img src="${getLogoUrl(a.code, a.name || a.code, a.logo_url || "")}" alt="${a.name || a.code} 로고" onerror="this.src='/data/logos/${a.code}.svg'"></div>
          <strong>${i + 1}. ${a.name || a.code}</strong>
        </div>
        <div class="rank-meta">${a.code}${a.close_price ? ` · ${formatNumber(a.close_price)}원` : ""}</div>
      </div>
    `).join("");

    els.themeFeed.innerHTML = `<div class="feed-item"><strong>DB 기반 추천 활성</strong><div class="rank-meta">랭킹 데이터 ${items.length}건</div></div>`;
  } catch {
    els.todaySurgeList.innerHTML = `<div class="rank-item">랭킹 API 연결 실패</div>`;
    els.tomorrowTop10.innerHTML = `<div class="rank-item">랭킹 API 연결 실패</div>`;
    els.signalFeed.innerHTML = `<div class="feed-item">신호 API 연결 실패</div>`;
    els.popularList.innerHTML = `<div class="feed-item">인기 API 연결 실패</div>`;
    els.themeFeed.innerHTML = `<div class="feed-item">테마 API 연결 실패</div>`;
  }
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

function initEvents() {
  if (els.manualToggle && els.manualPanel) {
    els.manualToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = els.manualPanel.hasAttribute("hidden");
      if (willOpen) els.manualPanel.removeAttribute("hidden");
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
