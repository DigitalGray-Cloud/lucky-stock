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

// 종목명 맵 (code → {name, market})
const stockNameMap = {};
for (const item of autocompleteItems) {
  stockNameMap[item.code] = { name: item.name, market: item.market };
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

function renderSummaryHtml(summary) {
  const headingSet = new Set([
    "이 회사 뭐 하는 곳인가",
    "왜 오를 수 있나",
    "뭐가 위험한가",
    "지금 가격이 싼가 비싼가",
    "그래서 지금 사도 되나",
  ]);
  const headingPrefixes = ["🏢 ", "📈 ", "⚠️ ", "💰 ", "🤔 "];

  return String(summary || "")
    .split("\n")
    .map((line) => {
      const text = line.trim();
      if (!text) return '<div style="height:0.75rem;"></div>';
      const noEmoji = headingPrefixes.reduce((acc, prefix) => acc.replace(prefix, ""), text).trim();
      if (headingPrefixes.some((prefix) => text.startsWith(prefix)) || headingSet.has(noEmoji)) {
        return `<div style="margin-top:0.9rem;font-size:1rem;font-weight:800;color:#0b357f;">${escapeHtml(text)}</div>`;
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

  const bull = Array.isArray(data.bull_points) ? data.bull_points : [];
  const risks = Array.isArray(data.risk_points) ? data.risk_points : [];

  const summaryHtml = renderSummaryHtml(data.summary || "");

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
  <meta property="og:image" content="https://luckystock.pages.dev/favicon.png" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(titleStr)}" />
  <meta name="twitter:description" content="${escapeHtml(descStr)}" />
  <meta name="twitter:image" content="https://luckystock.pages.dev/favicon.png" />
  <link rel="icon" href="/favicon.png" />
  <link rel="apple-touch-icon" href="/favicon.png" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2579165029846981" crossorigin="anonymous"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-R7Z766ZWFG"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-R7Z766ZWFG');</script>
  <link rel="stylesheet" href="/style.css?v=20260309a" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(name)} AI 주식 분석 - ${decision} 판단",
    "description": "${escapeHtml(descStr)}",
    "url": "${canonical}",
    "inLanguage": "ko",
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
</head>
<body>
  <header class="topbar">
    <div class="brand-wrap">
      <div class="brand-badge" aria-hidden="true">
        <img src="/favicon.png" alt="LuckyStock AI 로고" />
      </div>
      <div>
        <p class="brand-title"><a href="/" style="color:inherit;text-decoration:none;">LuckyStock AI</a></p>
        <p class="brand-sub">AI 한국 주식 투자 판단 엔진</p>
      </div>
    </div>
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
          ${bull.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
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

  const allUrls = [...baseUrls, ...stockUrls];

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

  // sitemap.xml 업데이트
  const sitemap = buildSitemap(codes);
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap, "utf-8");
  console.log(`✅ sitemap.xml 업데이트 완료 (${codes.length + 4}개 URL)`);

  console.log("\n🎉 모든 작업 완료!");
  console.log(`   - 종목 페이지: /stock/{code}/index.html × ${created}개`);
  console.log(`   - sitemap.xml: ${codes.length + 4}개 URL`);
}

main().catch(console.error);
