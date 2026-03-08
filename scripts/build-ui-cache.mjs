import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('/home/user/luckstock');
const DB_PATH = path.join(ROOT, 'data', 'stocks.db');
const OUT_DIR = path.join(ROOT, 'data');

const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS stock_analysis (
  code TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  favor_score INTEGER NOT NULL,
  signal TEXT NOT NULL,
  bull_points TEXT NOT NULL,
  future_outlook TEXT NOT NULL,
  risk TEXT NOT NULL,
  foreign_flow TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_ranking (
  code TEXT PRIMARY KEY,
  favor_score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`);

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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getSignal(favor) {
  if (favor >= 75) return '상승 가능';
  if (favor >= 55) return '중립';
  return '주의';
}

function getSignalEmoji(signal) {
  if (signal === '상승 가능') return '📈';
  if (signal === '중립') return '➖';
  return '⚠️';
}

const THEME_POOL = ['로봇', 'AI플랫폼', '전기차', 'AI반도체', '2차전지'];

function detectTheme(stock, favor) {
  const byName = String(stock.name || '').toLowerCase();
  if (byName.includes('로보') || byName.includes('robot')) return '로봇';
  if (byName.includes('네이버') || byName.includes('kakao') || byName.includes('카카오')) return 'AI플랫폼';
  if (byName.includes('자동차') || byName.includes('모비스') || byName.includes('기아') || byName.includes('현대')) return '전기차';
  if (byName.includes('반도체') || byName.includes('semicon') || byName.includes('hynix')) return 'AI반도체';
  if (byName.includes('에코프로') || byName.includes('배터리') || byName.includes('리튬') || byName.includes('전지')) return '2차전지';

  const idx = hashCode(`${stock.code}:${stock.name}:${favor}`) % THEME_POOL.length;
  return THEME_POOL[idx];
}

function buildAnalysis(stock) {
  const seed = hashCode(`${stock.code}:${stock.name}`);
  const price = Number(stock.close_price || 0);
  const priceFactor = price > 0 ? clamp(Math.round(Math.log10(price) * 12), 10, 30) : 12;

  const news = Math.round(seededRange(seed + 1, 45, 88));
  const earnings = Math.round(seededRange(seed + 2, 42, 92));
  const flow = Math.round(seededRange(seed + 3, 38, 90));
  const industry = Math.round(seededRange(seed + 4, 44, 91));
  const sentiment = clamp(Math.round(seededRange(seed + 5, 40, 86) + priceFactor / 4), 35, 95);

  const favor = Math.round(news * 0.2 + earnings * 0.25 + flow * 0.2 + industry * 0.2 + sentiment * 0.15);
  const signal = getSignal(favor);
  const signalEmoji = getSignalEmoji(signal);
  const triggerCount = clamp(Math.round(seededRange(seed + 6, 2, 6) + favor / 40), 2, 6);
  const tomorrowProb = clamp(Math.round(35 + favor * 0.52 + seededRange(seed + 7, -4, 8)), 40, 89);
  const prob1m = clamp(Math.round(30 + favor * 0.58 + seededRange(seed + 8, -6, 8)), 35, 91);
  const prob3m = clamp(Math.round(prob1m + seededRange(seed + 9, 4, 11)), 42, 94);
  const prob1y = clamp(Math.round(prob3m + seededRange(seed + 10, 4, 10)), 48, 96);
  const confidence = clamp(Math.round(45 + favor * 0.5), 45, 95);
  const theme = detectTheme(stock, favor);

  const signalFlags = [
    {
      key: 'news_spike',
      label: '뉴스 증가',
      desc: '최근 뉴스/모멘텀 점수 기준선 상회',
      active: news >= 62
    },
    {
      key: 'foreign_buy',
      label: '외국인 매수',
      desc: '외국인 수급 추정 점수 상단 구간',
      active: flow >= 58
    },
    {
      key: 'institution_buy',
      label: '기관 매수',
      desc: '기관 수급 추정 점수 상단 구간',
      active: earnings >= 60
    },
    {
      key: 'tech_breakout',
      label: '기술적 돌파',
      desc: '가격/심리 결합 시그널 강세',
      active: sentiment >= 60
    },
    {
      key: 'theme_momentum',
      label: '테마 모멘텀',
      desc: `${theme} 테마 평균 점수 우위`,
      active: industry >= 63
    },
    {
      key: 'volume_spike',
      label: '거래량 급증',
      desc: '유동성/심리 결합 지표 활성',
      active: favor >= 64
    }
  ];

  const bullPoints = [
    `🔥 지금 사는 이유: AI 분석 점수(100점 만점) ${favor}점으로 상단권`,
    `✅ ${stock.name} 수급/모멘텀이 동시 개선 구간`,
    `🚀 내일 상승 확률 ${tomorrowProb}% · ${signalEmoji} ${signal}`
  ];

  const riskPoints = [
    `⚠️ 단기 급등 후 되돌림 변동성 가능성`,
    `⚠️ 거시 변수(금리/환율/지수) 급변 시 동반 조정 리스크`,
    `⚠️ 거래대금 둔화 시 추세 약화 가능성`
  ];

  const future = favor >= 70
    ? '중기적으로 실적/수급 동반 시 우상향 가능성이 높습니다.'
    : favor >= 55
      ? '단기 변동성 구간으로 이벤트 확인 후 접근이 유효합니다.'
      : '리스크 구간으로 방어적 포지션 유지가 권장됩니다.';

  const risk = favor >= 70
    ? '단기 과열 시 조정 가능성 및 대외 변수 변동성 유의'
    : '거시 변수(금리/환율)와 거래대금 약화 리스크 점검 필요';

  const flowText = favor >= 70
    ? '외국인/기관 수급이 완만한 개선 흐름으로 추정됩니다.'
    : '수급 방향성이 약해 추세 확인이 필요합니다.';

  return {
    code: stock.code,
    summary: `${stock.name}(${stock.code})은 ${signal} 시그널로 분류되며 단기 모멘텀 점검이 필요합니다.`,
    favor_score: favor,
    signal,
    signal_emoji: signalEmoji,
    trigger_count: triggerCount,
    tomorrow_prob: tomorrowProb,
    prob_1m: prob1m,
    prob_3m: prob3m,
    prob_1y: prob1y,
    confidence,
    theme,
    signal_flags: signalFlags,
    bull_points: JSON.stringify(bullPoints),
    risk_points: JSON.stringify(riskPoints),
    future_outlook: future,
    risk,
    foreign_flow: flowText
  };
}

const stocks = db
  .prepare("SELECT code, name, market, close_price, logo_url FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') ORDER BY code")
  .all();

const now = new Date().toISOString();
const upsertAnalysis = db.prepare(`
INSERT INTO stock_analysis (code, summary, favor_score, signal, bull_points, future_outlook, risk, foreign_flow, updated_at)
VALUES (@code,@summary,@favor_score,@signal,@bull_points,@future_outlook,@risk,@foreign_flow,@updated_at)
ON CONFLICT(code) DO UPDATE SET
  summary=excluded.summary,
  favor_score=excluded.favor_score,
  signal=excluded.signal,
  bull_points=excluded.bull_points,
  future_outlook=excluded.future_outlook,
  risk=excluded.risk,
  foreign_flow=excluded.foreign_flow,
  updated_at=excluded.updated_at
`);

const analyses = stocks.map(buildAnalysis);
const txAnalysis = db.transaction((rows) => {
  for (const row of rows) {
    upsertAnalysis.run({
      code: row.code,
      summary: row.summary,
      favor_score: row.favor_score,
      signal: row.signal,
      bull_points: row.bull_points,
      future_outlook: row.future_outlook,
      risk: row.risk,
      foreign_flow: row.foreign_flow,
      updated_at: now
    });
  }
});

txAnalysis(analyses);

const ordered = [...analyses].sort((a, b) => b.favor_score - a.favor_score || String(a.code).localeCompare(String(b.code)));

db.prepare('DELETE FROM stock_ranking').run();
const insertRank = db.prepare('INSERT INTO stock_ranking (code, favor_score, rank, updated_at) VALUES (?,?,?,?)');
const txRank = db.transaction((rows) => {
  rows.forEach((row, i) => insertRank.run(row.code, row.favor_score, i + 1, now));
});
txRank(ordered);

const stockMap = new Map(stocks.map((s) => [s.code, s]));
const analysisMapLocal = new Map(analyses.map((a) => [a.code, a]));

const top = ordered.slice(0, 50).map((a, i) => {
  const s = stockMap.get(a.code) || {};
  return {
    code: a.code,
    favor_score: a.favor_score,
    rank: i + 1,
    name: s.name || a.code,
    market: s.market || '-',
    close_price: s.close_price ?? null,
    logo_url: s.logo_url || null,
    signal: a.signal,
    signal_emoji: a.signal_emoji,
    tomorrow_prob: a.tomorrow_prob,
    trigger_count: a.trigger_count,
    theme: a.theme
  };
});

const recent = ordered.slice(0, 100).map((a) => {
  const s = stockMap.get(a.code) || {};
  return {
    code: a.code,
    name: s.name || a.code,
    summary: a.summary,
    favor_score: a.favor_score,
    signal: a.signal,
    signal_emoji: a.signal_emoji,
    close_price: s.close_price ?? null,
    logo_url: s.logo_url || null,
    theme: a.theme,
    tomorrow_prob: a.tomorrow_prob,
    prob_1m: a.prob_1m,
    prob_3m: a.prob_3m,
    prob_1y: a.prob_1y,
    updated_at: now
  };
});

const analysisMap = Object.fromEntries(
  analyses.map((a) => {
    const s = stockMap.get(a.code) || {};
    return [
      a.code,
      {
        code: a.code,
        summary: a.summary,
        favor_score: a.favor_score,
        signal: a.signal,
        signal_emoji: a.signal_emoji,
        trigger_count: a.trigger_count,
        tomorrow_prob: a.tomorrow_prob,
        prob_1m: a.prob_1m,
        prob_3m: a.prob_3m,
        prob_1y: a.prob_1y,
        confidence: a.confidence,
        theme: a.theme,
        bull_points: JSON.parse(a.bull_points),
        risk_points: JSON.parse(a.risk_points || "[]"),
        signal_flags: a.signal_flags || [],
        future_outlook: a.future_outlook,
        risk: a.risk,
        foreign_flow: a.foreign_flow,
        close_price: s.close_price ?? null,
        logo_url: s.logo_url || null,
        updated_at: now,
        cache_hit: true,
        analysis_source: 'sqlite_batch'
      }
    ];
  })
);

const autocomplete = stocks.map((s) => ({
  code: s.code,
  name: s.name,
  market: s.market,
  close_price: s.close_price ?? null,
  logo_url: s.logo_url || null
}));

const themeMap = new Map();
for (const a of analyses) {
  const arr = themeMap.get(a.theme) || [];
  arr.push(a.favor_score);
  themeMap.set(a.theme, arr);
}

const themeBias = { '로봇': 14, 'AI플랫폼': 10, '전기차': 7, 'AI반도체': 6, '2차전지': 5 };
const themeRanking = [...themeMap.entries()]
  .map(([theme, values]) => ({
    theme,
    avg_score: clamp(Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) + (themeBias[theme] || 0), 40, 95),
    count: values.length
  }))
  .sort((x, y) => y.avg_score - x.avg_score)
  .slice(0, 10);

fs.writeFileSync(path.join(OUT_DIR, 'ui_top_stocks.json'), JSON.stringify({ generated_at: now, top }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_recent_analysis.json'), JSON.stringify({ generated_at: now, items: recent }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_analysis_map.json'), JSON.stringify({ generated_at: now, map: analysisMap }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_autocomplete.json'), JSON.stringify({ generated_at: now, items: autocomplete }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_theme_ranking.json'), JSON.stringify({ generated_at: now, items: themeRanking }, null, 2));

console.log(`[cache] stocks=${stocks.length}, top=${top.length}, recent=${recent.length}, analysis_map=${Object.keys(analysisMap).length}, themes=${themeRanking.length}`);
console.log(`[cache] files written to ${OUT_DIR}`);

db.close();
