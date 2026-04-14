#!/usr/bin/env node
/**
 * 종목별 정적 HTML 페이지 생성 스크립트
 * - /stock/{code}/index.html 생성 (SEO용 정적 페이지)
 * - sitemap.xml 업데이트
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// 데이터 로드
const analysisMap = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ui_analysis_map.json"), "utf-8")).map;
const autocompleteData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ui_autocomplete.json"), "utf-8"));
const autocompleteItems = autocompleteData.items || [];
const newsMap = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ui_news_map.json"), "utf-8")).map || {};

// 종목명 맵 (code → {name, market})
const stockNameMap = {};
for (const item of autocompleteItems) {
  stockNameMap[item.code] = { name: item.name, market: item.market };
}

// 테마별 종목 맵 (theme → [{code, name, favor_score, signal}])
const themeMap = {};
for (const [code, data] of Object.entries(analysisMap)) {
  const theme = data.theme || "기타";
  if (!themeMap[theme]) themeMap[theme] = [];
  const meta = stockNameMap[code] || {};
  themeMap[theme].push({ code, name: meta.name || code, favor_score: data.favor_score || 0, signal: data.signal || "중립", signal_emoji: data.signal_emoji || "➖" });
}
// 각 테마 내 종목을 favor_score 내림차순 정렬
for (const theme of Object.keys(themeMap)) {
  themeMap[theme].sort((a, b) => b.favor_score - a.favor_score);
}

const THEME_DESCRIPTIONS = {
  "AI플랫폼": "AI 소프트웨어, 데이터, 인터넷 서비스, 클라우드와 같은 디지털 플랫폼 축에서 수혜를 받는 종목군입니다.",
  "AI반도체": "AI 연산 수요 확대의 직접 수혜를 받는 반도체, 장비, 부품 종목군입니다.",
  "로봇": "자동화 투자와 스마트팩토리 흐름의 수혜를 받는 로봇·자동화 종목군입니다.",
  "2차전지": "배터리 셀, 소재, 장비 등 전기차 밸류체인과 연결된 종목군입니다.",
  "식품": "원가와 소비 회복 흐름에 따라 실적이 반응하는 식품·음료 종목군입니다.",
  "유통": "오프라인·온라인 소비와 채널 경쟁력이 실적에 직결되는 유통 종목군입니다.",
  "제약/바이오": "신약, 임상, 기술이전, 의료 수요와 연결된 제약·바이오 종목군입니다.",
  "금융": "금리, 건전성, 자본정책 변화의 영향을 크게 받는 금융 종목군입니다.",
  "에너지": "전력, 정유, 가스, 신재생 투자 흐름과 연결된 에너지 종목군입니다.",
  "게임/엔터": "신작 흥행과 IP 가치가 핵심인 게임·엔터 종목군입니다.",
  "기타": "특정 테마보다 개별 기업 이슈에 의해 움직이는 종목군입니다."
};

const THEME_SLUGS = {
  "AI플랫폼": "ai-platform",
  "AI반도체": "ai-semiconductor",
  "로봇": "robotics",
  "유통": "retail",
  "식품": "food",
  "2차전지": "battery",
  "제약/바이오": "biotech",
  "금융": "finance",
  "에너지": "energy",
  "게임/엔터": "game-ent",
  "건설": "construction",
  "화학": "chemical",
  "통신": "telecom",
  "항공": "airline",
  "해운/물류": "shipping-logistics",
  "반도체장비": "semiconductor-equipment",
  "자동차": "auto",
  "여행/관광": "travel-leisure",
  "철강/소재": "steel-materials",
  "기타": "general"
};

function slugifyTheme(theme) {
  const value = String(theme || "기타").trim();
  return THEME_SLUGS[value] || encodeURIComponent(value);
}

function getThemeIcon(theme) {
  const text = String(theme || "");
  if (/AI플랫폼/.test(text)) return "🕸";
  if (/AI반도체/.test(text)) return "🧩";
  if (/로봇/.test(text)) return "🤖";
  if (/유통|리테일|커머스|쇼핑/.test(text)) return "🛍";
  if (/식품|푸드|식자재|외식/.test(text)) return "🍽";
  if (/2차전지|배터리|전기차/.test(text)) return "🔋";
  if (/제약|바이오|의료/.test(text)) return "💊";
  if (/금융|은행|증권/.test(text)) return "💹";
  if (/에너지|전력|원전/.test(text)) return "⚡";
  if (/게임|엔터|콘텐츠/.test(text)) return "🎮";
  return "📌";
}

function getDecisionLabel(signal, favor) {
  if (!signal && !favor) return "HOLD";
  if (signal === "상승 가능" || favor >= 75) return "BUY";
  if (signal === "주의" || favor < 50) return "SELL";
  return "HOLD";
}

function getDecisionColor(decision) {
  if (decision === "BUY") return "#16a34a";
  if (decision === "SELL") return "#dc2626";
  return "#d97706";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReasonList(items = []) {
  return (items || []).map((item) => {
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

function findNewsLinkForSummaryLine(code, line) {
  const text = String(line || "").trim();
  if (!code || !text) return "";
  const items = Array.isArray(newsMap?.[code]) ? newsMap[code] : [];
  const titleOnly = text.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").replace(/^['"]|['"]$/g, "");
  const hit = items.find((item) => {
    const itemTitle = String(item?.title || "").trim();
    return itemTitle && (text.includes(itemTitle) || titleOnly.includes(itemTitle) || itemTitle.includes(titleOnly));
  });
  return String(hit?.link || "");
}

function buildCombinedSummaryText(data, fallbackSummary = "") {
  return [fallbackSummary, String(data?.financial_summary || "").trim()].filter(Boolean).join("\n\n");
}

function formatFinancialMetricValue(value, type = "number") {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (type === "won") return `${Math.round(num).toLocaleString("ko-KR")}원`;
  if (type === "percent") return `${num.toFixed(1)}%`;
  if (type === "multiple") return `${num.toFixed(1)}배`;
  if (type === "eok") return `${(num / 100000000).toFixed(1)}억원`;
  return Math.round(num).toLocaleString("ko-KR");
}

function renderFinancialMetricsTable(metrics = null) {
  if (!metrics || typeof metrics !== "object") return "";
  const rows = [
    { label: "매출", value: formatFinancialMetricValue(metrics.revenue, "eok"), desc: "회사가 벌어들인 총매출" },
    { label: "영업이익", value: formatFinancialMetricValue(metrics.operating_income, "eok"), desc: "본업으로 남긴 이익" },
    { label: "순이익", value: formatFinancialMetricValue(metrics.net_income, "eok"), desc: "최종적으로 남은 이익" },
    { label: "ROE", value: formatFinancialMetricValue(metrics.roe, "percent"), desc: "자기자본 대비 수익성" },
    { label: "부채비율", value: formatFinancialMetricValue(metrics.debt_ratio, "percent"), desc: "자기자본 대비 빚 부담" },
    { label: "영업이익률", value: formatFinancialMetricValue(metrics.operating_margin, "percent"), desc: "매출 대비 본업 마진" },
    { label: "EPS", value: formatFinancialMetricValue(metrics.eps, "won"), desc: "주당 순이익" },
    { label: "BPS", value: formatFinancialMetricValue(metrics.bps, "won"), desc: "주당 순자산" },
    { label: "PER", value: formatFinancialMetricValue(metrics.per, "multiple"), desc: "이익 대비 주가 수준" },
    { label: "PBR", value: formatFinancialMetricValue(metrics.pbr, "multiple"), desc: "순자산 대비 주가 수준" }
  ];
  if (!rows.some((row) => row.value !== "-")) return "";
  return `
    <div style="margin-top:0.9rem;padding:1rem 1rem 1.1rem;border:1px solid #dbe7ff;border-radius:14px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);box-shadow:0 10px 22px rgba(17,70,167,0.06);">
      <div style="display:inline-flex;padding:0.2rem 0.55rem;border-radius:999px;background:#dcebff;color:#2753a6;font-size:0.72rem;font-weight:900;letter-spacing:0.03em;">핵심 재무표</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0.65rem;margin-top:0.8rem;">
        ${rows.map((row) => `
          <div style="padding:0.75rem 0.85rem;border-radius:12px;background:#fff;border:1px solid #e3ecff;">
            <div style="font-size:0.74rem;color:#6b7280;">${row.label}</div>
            <div style="margin-top:0.2rem;font-size:0.95rem;font-weight:800;color:#0f172a;">${row.value}</div>
            <div style="margin-top:0.22rem;font-size:0.73rem;line-height:1.45;color:#6b7280;">${row.desc}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderSummaryHtml(summary, code = "") {
  const headingSet = new Set([
    "이 회사 뭐 하는 곳인가",
    "왜 오를 수 있나",
    "뭐가 위험한가",
    "지금 가격이 싼가 비싼가",
    "그래서 지금 사도 되나",
    "재무제표 및 회사 성적표",
  ]);
  const headingPrefixes = ["🏢 ", "📈 ", "⚠️ ", "💰 ", "🤔 ", "📊 "];

  return String(summary || "")
    .split("\n")
    .map((line) => {
      const text = line.trim();
      if (!text) return '<div style="height:0.75rem;"></div>';
      const noEmoji = headingPrefixes.reduce((acc, prefix) => acc.replace(prefix, ""), text).trim();
      if (headingPrefixes.some((prefix) => text.startsWith(prefix)) || headingSet.has(noEmoji)) {
        const headingHtml = `<div style="margin-top:0.9rem;font-size:1rem;font-weight:800;color:#0b357f;">${escapeHtml(text)}</div>`;
        if (noEmoji === "재무제표 및 회사 성적표") {
          return `${headingHtml}${renderFinancialMetricsTable(analysisMap[code]?.financial_metrics || null)}`;
        }
        return headingHtml;
      }
      if (/^\d{4}-\d{2}-\d{2}\s+['"].+['"]/.test(text)) {
        const href = findNewsLinkForSummaryLine(code, text);
        const safeText = escapeHtml(text);
        if (href) {
          return `<div style="margin-top:0.85rem;padding:0.9rem 1rem;border:1px solid #cfe0ff;border-left:4px solid #1d5fd4;border-radius:12px;background:linear-gradient(180deg,#f6faff 0%,#ffffff 100%);box-shadow:0 8px 18px rgba(17,70,167,0.07);"><div style="display:inline-flex;padding:0.2rem 0.55rem;border-radius:999px;background:#dcebff;color:#2753a6;font-size:0.72rem;font-weight:900;letter-spacing:0.03em;">핵심 기사</div><p style="margin:0.45rem 0 0;line-height:1.8;font-weight:800;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#0b4cc4;text-decoration:none;">${safeText}</a></p></div>`;
        }
      }
      if (text.startsWith("-> ")) {
        return `<div style="margin:0.45rem 0 0 0.75rem;padding:0.8rem 0.95rem;border-left:3px solid #9dbaf1;border-radius:0 10px 10px 0;background:#f8fbff;color:#334155;line-height:1.72;"><div style="margin-bottom:0.2rem;color:#6b7f99;font-size:0.72rem;font-weight:900;letter-spacing:0.03em;text-transform:uppercase;">해석</div>${escapeHtml(text.slice(3))}</div>`;
      }
      return `<p style="margin:0.5rem 0 0;line-height:1.8;">${escapeHtml(text)}</p>`;
    })
    .join("");
}

function buildStockPage(code, data) {
  const meta = stockNameMap[code] || {};
  const name = meta.name || data.name || code;
  const market = meta.market || data.market || "KOSPI/KOSDAQ";
  const favor = Number(data.favor_score || 0);
  const signal = data.signal || "중립";
  const signalEmoji = data.signal_emoji || "➖";
  const decision = getDecisionLabel(signal, favor);
  const decisionColor = getDecisionColor(decision);
  const confidence = Number(data.confidence || favor || 0);
  const prob1m = Number(data.prob_1m || 0);
  const prob3m = Number(data.prob_3m || 0);
  const prob1y = Number(data.prob_1y || 0);
  const theme = data.theme || "";
  const tomorrow = Number(data.tomorrow_prob || 0);

  const titleStr = `${name}(${code}) AI 주식 분석 | ${decision} 판단 | LuckyStock AI`;
  const descStr = `${name}(${code}) AI 투자 판단 ${decision}. AI 분석 점수 ${favor}/100, 신뢰도 ${confidence}%. 1개월 상승확률 ${prob1m}%, 3개월 ${prob3m}%. ${market} 상장. 수급·리스크·전망 분석 제공.`;
  const canonical = `https://luckystock.pages.dev/stock/${code}`;
  const today = new Date().toISOString().slice(0, 10);

  // 동일 테마 관련 종목 (본인 제외, 최대 6개)
  const relatedTheme = theme || "기타";
  const relatedStocks = (themeMap[relatedTheme] || [])
    .filter(s => s.code !== code)
    .slice(0, 6);

  const bull = Array.isArray(data.bull_points) ? data.bull_points : [];
  const risks = Array.isArray(data.risk_points) ? data.risk_points : [];

  const summaryHtml = renderSummaryHtml(buildCombinedSummaryText(data, data.summary || ""), code);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(titleStr)}</title>
  <meta name="description" content="${escapeHtml(descStr)}" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
  <meta name="author" content="LuckyStock AI" />
  <meta name="theme-color" content="#1146a7" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="LuckyStock AI" />
  <meta property="og:title" content="${escapeHtml(titleStr)}" />
  <meta property="og:description" content="${escapeHtml(descStr)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="https://luckystock.pages.dev/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(titleStr)}" />
  <meta name="twitter:description" content="${escapeHtml(descStr)}" />
  <meta name="twitter:image" content="https://luckystock.pages.dev/og-image.png" />
  <link rel="icon" type="image/png" href="/favicon-app.png?v=20260414a" />
  <link rel="shortcut icon" href="/favicon-app.png?v=20260414a" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=20260414a" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2579165029846981" crossorigin="anonymous"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-R7Z766ZWFG"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-R7Z766ZWFG');</script>
  <link rel="stylesheet" href="/style.css?v=20260313a" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(name)} AI 주식 분석 - ${decision} 판단",
    "description": "${escapeHtml(descStr)}",
    "url": "${canonical}",
    "inLanguage": "ko",
    "datePublished": "${today}",
    "dateModified": "${today}",
    "author": {"@type": "Organization", "name": "LuckyStock AI", "url": "https://luckystock.pages.dev/"},
    "publisher": {
      "@type": "Organization",
      "name": "LuckyStock AI",
      "url": "https://luckystock.pages.dev/",
      "logo": {"@type": "ImageObject", "url": "https://luckystock.pages.dev/favicon.png"}
    },
    "mainEntityOfPage": {"@type": "WebPage", "@id": "${canonical}"}
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type": "ListItem", "position": 1, "name": "홈", "item": "https://luckystock.pages.dev/"},
      {"@type": "ListItem", "position": 2, "name": "${escapeHtml(relatedTheme)}", "item": "https://luckystock.pages.dev/"},
      {"@type": "ListItem", "position": 3, "name": "${escapeHtml(name)}", "item": "${canonical}"}
    ]
  }
  </script>
</head>
<body>
  <header class="topbar">
    <a href="/" class="brand-wrap brand-home-link" aria-label="LuckyStock AI 홈으로 이동">
      <div class="brand-badge" aria-hidden="true">
        <img src="/favicon.png" alt="LuckyStock AI 로고" />
      </div>
      <div>
        <p class="brand-title">LuckyStock AI</p>
        <p class="brand-sub">AI 한국 주식 투자 판단 엔진</p>
      </div>
    </a>
    <div class="top-right-tools">
      <p class="build-note">KOSPI · KOSDAQ · v2.1.0</p>
      <a href="/" class="manual-btn" style="text-decoration:none;">← 홈으로</a>
    </div>
  </header>

  <main class="container">
    <!-- SEO용 정적 콘텐츠 - 구글 크롤러가 읽는 영역 -->
    <article class="card" style="margin-bottom:1.5rem;">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
        <img src="/data/logos/${escapeHtml(code)}.png" alt="${escapeHtml(name)} 로고"
             onerror="this.style.display='none'"
             style="width:48px;height:48px;border-radius:8px;object-fit:contain;" />
        <div>
          <h1 style="margin:0;font-size:1.4rem;">${escapeHtml(name)}</h1>
          <p style="margin:0;color:#6b7280;font-size:0.9rem;">${escapeHtml(code)} · ${escapeHtml(market)}${theme ? ` · ${escapeHtml(theme)}` : ""}</p>
        </div>
        <div style="margin-left:auto;text-align:center;">
          <div style="font-size:1.8rem;font-weight:900;color:${decisionColor};">${decision}</div>
          <div style="font-size:0.8rem;color:#6b7280;">AI 판단</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem;margin-bottom:1.5rem;">
        <div style="text-align:center;padding:0.75rem;background:#f9fafb;border-radius:8px;">
          <div style="font-size:1.4rem;font-weight:700;color:#1146a7;">${favor}</div>
          <div style="font-size:0.75rem;color:#6b7280;">AI 분석 점수</div>
        </div>
        <div style="text-align:center;padding:0.75rem;background:#f9fafb;border-radius:8px;">
          <div style="font-size:1.4rem;font-weight:700;color:#1146a7;">${confidence}%</div>
          <div style="font-size:0.75rem;color:#6b7280;">신뢰도</div>
        </div>
        <div style="text-align:center;padding:0.75rem;background:#f9fafb;border-radius:8px;">
          <div style="font-size:1.4rem;">${signalEmoji}</div>
          <div style="font-size:0.75rem;color:#6b7280;">${escapeHtml(signal)}</div>
        </div>
        ${tomorrow ? `<div style="text-align:center;padding:0.75rem;background:#f9fafb;border-radius:8px;">
          <div style="font-size:1.4rem;font-weight:700;color:#16a34a;">${tomorrow}%</div>
          <div style="font-size:0.75rem;color:#6b7280;">내일 상승확률</div>
        </div>` : ""}
      </div>

      ${prob1m || prob3m || prob1y ? `
      <div style="margin-bottom:1.5rem;">
        <h2 style="font-size:1rem;margin-bottom:0.75rem;">📊 기간별 상승 확률</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;">
          ${prob1m ? `<div style="text-align:center;padding:0.5rem;border:1px solid #e5e7eb;border-radius:6px;"><div style="font-weight:700;color:#1146a7;">${prob1m}%</div><div style="font-size:0.75rem;color:#6b7280;">1개월</div></div>` : ""}
          ${prob3m ? `<div style="text-align:center;padding:0.5rem;border:1px solid #e5e7eb;border-radius:6px;"><div style="font-weight:700;color:#1146a7;">${prob3m}%</div><div style="font-size:0.75rem;color:#6b7280;">3개월</div></div>` : ""}
          ${prob1y ? `<div style="text-align:center;padding:0.5rem;border:1px solid #e5e7eb;border-radius:6px;"><div style="font-weight:700;color:#1146a7;">${prob1y}%</div><div style="font-size:0.75rem;color:#6b7280;">1년</div></div>` : ""}
        </div>
      </div>` : ""}

      ${bull.length ? `
      <div style="margin-bottom:1.5rem;">
        <h2 style="font-size:1rem;margin-bottom:0.75rem;">✅ 매수 근거</h2>
        <ul style="margin:0;padding-left:1.2rem;line-height:1.8;">
          ${renderReasonList(bull)}
        </ul>
      </div>` : ""}

      ${risks.length ? `
      <div style="margin-bottom:1.5rem;">
        <h2 style="font-size:1rem;margin-bottom:0.75rem;">⚠️ 주요 리스크</h2>
        <ul style="margin:0;padding-left:1.2rem;line-height:1.8;">
          ${risks.map(r => `<li>${escapeHtml(r)}</li>`).join("")}
        </ul>
      </div>` : ""}

      ${summaryHtml ? `
      <div style="margin-bottom:1rem;">
        <h2 style="font-size:1rem;margin-bottom:0.75rem;">📝 AI 종합 분석</h2>
        <div style="font-size:0.9rem;line-height:1.8;color:#374151;">${summaryHtml}</div>
      </div>` : ""}

      <div style="margin-top:1.5rem;text-align:center;">
        <a href="/?code=${code}" style="display:inline-block;padding:0.75rem 2rem;background:#1146a7;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
          🔍 ${escapeHtml(name)} 실시간 AI 분석 보기
        </a>
      </div>

      <p style="margin-top:1rem;font-size:0.75rem;color:#9ca3af;text-align:center;">
        ※ 본 내용은 투자 보조 정보이며 최종 투자 판단과 책임은 본인에게 있습니다. 데이터 기준: KRX, 네이버금융, Google News
      </p>
    </article>

    ${relatedStocks.length ? `
    <article style="background:#fff;border-radius:16px;padding:1.5rem;margin-bottom:1.5rem;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
      <h2 style="font-size:1rem;margin:0 0 1rem;color:#0b357f;">🔗 같은 테마 관련 종목 — ${escapeHtml(relatedTheme)}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.75rem;">
        ${relatedStocks.map(s => {
          const sDecision = s.favor_score >= 75 ? "BUY" : s.favor_score >= 50 ? "HOLD" : "SELL";
          const sColor = sDecision === "BUY" ? "#16a34a" : sDecision === "SELL" ? "#dc2626" : "#d97706";
          return `<a href="/stock/${s.code}" style="display:block;padding:0.85rem;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;text-decoration:none;transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(17,70,167,0.12)'" onmouseout="this.style.boxShadow='none'">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
              <span style="font-weight:700;font-size:0.85rem;color:#111827;">${escapeHtml(s.name)}</span>
              <span style="font-size:0.72rem;font-weight:800;color:${sColor};background:${sColor}18;padding:0.1rem 0.4rem;border-radius:999px;">${sDecision}</span>
            </div>
            <div style="font-size:0.75rem;color:#6b7280;">${s.code} · 점수 ${s.favor_score}</div>
            <div style="font-size:0.75rem;color:#6b7280;margin-top:0.2rem;">${s.signal_emoji} ${escapeHtml(s.signal)}</div>
          </a>`;
        }).join("")}
      </div>
    </article>` : ""}

    <article style="background:linear-gradient(135deg,#0b1f3a 0%,#1146a7 100%);border-radius:16px;padding:1.5rem;margin-bottom:1.5rem;color:#fff;">
      <h2 style="font-size:1rem;margin:0 0 0.75rem;color:#93c5fd;">Powered by World-Class AI Models</h2>
      <p style="font-size:0.85rem;color:#bfdbfe;margin:0 0 1rem;">This analysis is generated by combining insights from multiple leading AI models.</p>
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <svg viewBox="0 0 41 41" style="width:24px;height:24px;fill:#ffffff;" aria-label="OpenAI" xmlns="http://www.w3.org/2000/svg"><path d="M37.5 16.9a10.2 10.2 0 0 0-.9-8.4 10.4 10.4 0 0 0-11.2-5A10.3 10.3 0 0 0 17.6 0a10.4 10.4 0 0 0-9.9 7.2 10.3 10.3 0 0 0-6.9 5 10.4 10.4 0 0 0 1.3 12.2 10.2 10.2 0 0 0 .9 8.4 10.4 10.4 0 0 0 11.2 5 10.3 10.3 0 0 0 7.8 3.5 10.4 10.4 0 0 0 9.9-7.2 10.3 10.3 0 0 0 6.9-5 10.4 10.4 0 0 0-1.3-12.2zm-15.5 21.7a7.7 7.7 0 0 1-5-1.8l.3-.1 8.2-4.7a1.4 1.4 0 0 0 .7-1.2v-11.5l3.5 2a.1.1 0 0 1 .1.1v9.5a7.7 7.7 0 0 1-7.8 7.7zM4.6 31.5a7.7 7.7 0 0 1-.9-5.2l.2.2 8.2 4.7a1.4 1.4 0 0 0 1.4 0l10-5.8v4a.1.1 0 0 1-.1.1l-8.3 4.8a7.7 7.7 0 0 1-10.5-2.8zm-1-16.9a7.7 7.7 0 0 1 4-3.4v9.6a1.4 1.4 0 0 0 .7 1.2l10 5.8-3.5 2a.1.1 0 0 1-.1 0L6.4 24.9a7.7 7.7 0 0 1-2.8-10.4zm28.6 6.6-10-5.8 3.5-2a.1.1 0 0 1 .1 0l8.3 4.8a7.7 7.7 0 0 1-1.2 13.9v-9.6a1.4 1.4 0 0 0-.7-1.3zm3.4-5.2-.2-.2-8.2-4.7a1.4 1.4 0 0 0-1.4 0l-10 5.8v-4a.1.1 0 0 1 .1-.1l8.3-4.8a7.7 7.7 0 0 1 11.5 8zm-21.7 7.1-3.5-2a.1.1 0 0 1-.1-.1v-9.5a7.7 7.7 0 0 1 12.6-5.9l-.3.1-8.2 4.7a1.4 1.4 0 0 0-.7 1.2zm1.9-4.1 4.5-2.6 4.5 2.6v5.2l-4.5 2.6-4.5-2.6z"/></svg>
          <div>
            <div style="font-size:0.8rem;font-weight:700;color:#fff;">OpenAI GPT</div>
            <div style="font-size:0.7rem;color:#93c5fd;">News &amp; sentiment</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <img src="https://cdn.simpleicons.org/anthropic/ffffff" alt="Anthropic" style="width:24px;height:24px;filter:invert(1);" />
          <div>
            <div style="font-size:0.8rem;font-weight:700;color:#fff;">Anthropic Claude</div>
            <div style="font-size:0.7rem;color:#93c5fd;">Reasoning &amp; risk</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <img src="https://cdn.simpleicons.org/googlegemini/ffffff" alt="Gemini" style="width:24px;height:24px;filter:invert(1);" />
          <div>
            <div style="font-size:0.8rem;font-weight:700;color:#fff;">Google Gemini</div>
            <div style="font-size:0.7rem;color:#93c5fd;">Trend detection</div>
          </div>
        </div>
      </div>
    </article>
  </main>

  <footer style="text-align:center;padding:2rem;color:#9ca3af;font-size:0.8rem;border-top:1px solid #e5e7eb;margin-top:2rem;">
    <p><a href="/" style="color:#6b7280;">LuckyStock AI</a> · <a href="/about" style="color:#6b7280;">소개</a> · <a href="/privacy" style="color:#6b7280;">개인정보처리방침</a></p>
    <p style="margin-top:0.5rem;">© 2026 LuckyStock AI. 투자 보조 도구이며 투자 권유 서비스가 아닙니다.</p>
  </footer>

  <script>
    // 홈에서 JS로 전체 인터랙티브 분석 로드
    if (window.location.pathname.startsWith('/stock/')) {
      const rawCode = window.location.pathname.split('/stock/')[1] || '';
      const code = rawCode.endsWith('/') ? rawCode.slice(0, -1) : rawCode;
      if (code) {
        const link = document.querySelector('a[href*="/?code="]');
        if (link) link.href = '/?code=' + code;
      }
    }
  </script>
</body>
</html>`;
}

function buildThemePage(theme, ranked, rankingMeta) {
  const slug = slugifyTheme(theme);
  const canonical = `https://luckystock.pages.dev/theme/${slug}`;
  const description = THEME_DESCRIPTIONS[theme] || `${theme} 테마 관련 종목의 AI 점수와 추천 종목을 모은 상세 페이지입니다.`;
  const titleStr = `${theme} 테마 분석 | 테마별 추천 종목 | LuckyStock AI`;
  const topPicks = ranked.slice(0, 5);
  const allItems = ranked.slice(0, 20);
  const avgScore = Number(rankingMeta?.avg_score || 0);
  const themeIcon = getThemeIcon(theme);
  const today = new Date().toISOString().slice(0, 10);

  const pickCards = topPicks.map((item, idx) => {
    const data = analysisMap[item.code] || {};
    const meta = stockNameMap[item.code] || {};
    return `
      <a href="/stock/${item.code}/" class="feed-item clickable" style="display:block;text-decoration:none;color:inherit;">
        <div class="rank-top">
          <div class="rank-row">
            <div class="rank-logo"><img src="/data/logos/${item.code}.png" alt="${escapeHtml(item.name)} 로고" onerror="this.src='/data/logos/${item.code}.svg'"></div>
            <span class="rank-name">${idx + 1}. ${escapeHtml(item.name)}</span>
          </div>
          <strong>${Number(data.favor_score || item.favor_score || 0)}점</strong>
        </div>
        <div class="rank-meta">${escapeHtml(item.code)} · ${escapeHtml(meta.market || "")}${data.signal ? ` · ${escapeHtml(data.signal)}` : ""}${data.tomorrow_prob ? ` · 내일 확률 ${escapeHtml(String(data.tomorrow_prob))}%` : ""}</div>
      </a>
    `;
  }).join("");

  const tableRows = allItems.map((item, idx) => {
    const data = analysisMap[item.code] || {};
    return `
      <tr>
        <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;">${idx + 1}</td>
        <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;"><a href="/stock/${item.code}/" style="color:#1146a7;text-decoration:none;font-weight:800;">${escapeHtml(item.name)}</a></td>
        <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.code)}</td>
        <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;">${Number(data.favor_score || item.favor_score || 0)}</td>
        <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.signal || item.signal || "-")}</td>
        <td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;">${Number(data.tomorrow_prob || 0)}%</td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(titleStr)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
  <meta name="author" content="LuckyStock AI" />
  <meta name="theme-color" content="#1146a7" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="LuckyStock AI" />
  <meta property="og:title" content="${escapeHtml(titleStr)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="https://luckystock.pages.dev/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(titleStr)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="https://luckystock.pages.dev/og-image.png" />
  <link rel="icon" type="image/png" href="/favicon-app.png?v=20260414a" />
  <link rel="shortcut icon" href="/favicon-app.png?v=20260414a" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=20260414a" />
  <link rel="stylesheet" href="/style.css?v=20260313a" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "${escapeHtml(theme)} 테마 분석",
    "description": "${escapeHtml(description)}",
    "url": "${canonical}",
    "inLanguage": "ko",
    "dateModified": "${today}"
  }
  </script>
</head>
<body>
  <header class="topbar">
    <a href="/" class="brand-wrap brand-home-link" aria-label="LuckyStock AI 홈으로 이동">
      <div class="brand-badge" aria-hidden="true">
        <img src="/favicon.png" alt="LuckyStock AI 로고" />
      </div>
      <div>
        <p class="brand-title">LuckyStock AI</p>
        <p class="brand-sub">${escapeHtml(theme)} 테마 상세</p>
      </div>
    </a>
    <div class="top-right-tools">
      <a href="/" class="manual-btn" style="text-decoration:none;">← 홈으로</a>
    </div>
  </header>

  <main class="container">
    <section class="card" style="background:linear-gradient(135deg,#0b1f3a 0%,#1146a7 100%);color:#fff;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="theme-icon" style="width:44px;height:44px;font-size:1.35rem;border-color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.12);">${themeIcon}</div>
        <div>
          <h1 style="margin:0;color:#fff;">${escapeHtml(theme)} 테마 분석</h1>
          <p style="margin:6px 0 0;color:#dbeafe;">${escapeHtml(description)}</p>
        </div>
      </div>
      <div style="margin-top:12px;color:#dbeafe;font-weight:700;">평균 AI 점수 ${avgScore}점 · 포함 종목 ${Number(rankingMeta?.count || ranked.length)}개</div>
    </section>

    <section class="card">
      <div class="section-head emph">
        <h2>${escapeHtml(theme)} 추천 Top 5</h2>
        <span class="chip">Theme Pick</span>
      </div>
      <div class="rank-list">${pickCards}</div>
    </section>

    <section class="card">
      <div class="section-head emph">
        <h2>${escapeHtml(theme)} 종목 리스트</h2>
        <span class="chip">Top 20</span>
      </div>
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.93rem;margin-top:10px;">
          <thead>
            <tr style="background:#f0f7ff;">
              <th style="padding:0.75rem;text-align:left;border-bottom:2px solid #1146a7;">순위</th>
              <th style="padding:0.75rem;text-align:left;border-bottom:2px solid #1146a7;">종목</th>
              <th style="padding:0.75rem;text-align:left;border-bottom:2px solid #1146a7;">코드</th>
              <th style="padding:0.75rem;text-align:left;border-bottom:2px solid #1146a7;">AI 점수</th>
              <th style="padding:0.75rem;text-align:left;border-bottom:2px solid #1146a7;">신호</th>
              <th style="padding:0.75rem;text-align:left;border-bottom:2px solid #1146a7;">내일 확률</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildSitemap(codes, names) {
  const baseUrls = [
    { loc: "https://luckystock.pages.dev/", changefreq: "hourly", priority: "1.0" },
    { loc: "https://luckystock.pages.dev/about", changefreq: "monthly", priority: "0.6" },
    { loc: "https://luckystock.pages.dev/privacy", changefreq: "monthly", priority: "0.5" },
    { loc: "https://luckystock.pages.dev/contact", changefreq: "monthly", priority: "0.5" },
  ];

  const stockUrls = codes.map((code) => ({
    loc: `https://luckystock.pages.dev/stock/${code}`,
    changefreq: "daily",
    priority: "0.8",
  }));

  const themeUrls = Object.keys(themeMap).map((theme) => ({
    loc: `https://luckystock.pages.dev/theme/${slugifyTheme(theme)}`,
    changefreq: "daily",
    priority: "0.7",
  }));

  const allUrls = [...baseUrls, ...stockUrls, ...themeUrls];

  const urlEntries = allUrls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

// 메인 실행
async function main() {
  const codes = Object.keys(analysisMap);
  const themes = Object.keys(themeMap);
  console.log(`📊 총 ${codes.length}개 종목 페이지 생성 시작...`);

  const stockDir = path.join(ROOT, "stock");
  let created = 0;
  let skipped = 0;

  for (const code of codes) {
    const data = analysisMap[code];
    const dir = path.join(stockDir, code);
    const filePath = path.join(dir, "index.html");

    fs.mkdirSync(dir, { recursive: true });
    const html = buildStockPage(code, data);
    fs.writeFileSync(filePath, html, "utf-8");
    created++;

    if (created % 200 === 0) {
      console.log(`  ✅ ${created}/${codes.length} 생성 완료...`);
    }
  }

  console.log(`✅ 종목 페이지 ${created}개 생성 완료`);

  const themeDir = path.join(ROOT, "theme");
  fs.mkdirSync(themeDir, { recursive: true });
  for (const theme of themes) {
    const dir = path.join(themeDir, slugifyTheme(theme));
    fs.mkdirSync(dir, { recursive: true });
    const rankingMeta = (JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ui_theme_ranking.json"), "utf-8")).items || []).find((item) => item.theme === theme) || null;
    const html = buildThemePage(theme, themeMap[theme] || [], rankingMeta);
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf-8");
  }
  console.log(`✅ 테마 페이지 ${themes.length}개 생성 완료`);

  // sitemap.xml 업데이트
  const sitemap = buildSitemap(codes);
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap, "utf-8");
  console.log(`✅ sitemap.xml 업데이트 완료 (${codes.length + themes.length + 4}개 URL)`);

  console.log("\n🎉 모든 작업 완료!");
  console.log(`   - 종목 페이지: /stock/{code}/index.html × ${created}개`);
  console.log(`   - 테마 페이지: /theme/{slug}/index.html × ${themes.length}개`);
  console.log(`   - sitemap.xml: ${codes.length + themes.length + 4}개 URL`);
}

main().catch(console.error);
