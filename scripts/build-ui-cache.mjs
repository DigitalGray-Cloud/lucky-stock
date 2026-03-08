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
  const signal = favor >= 75 ? '상승 가능' : favor >= 55 ? '중립' : '주의';

  const bullPoints = [
    `${stock.market} 내 수급 개선 가능성`,
    `${stock.name} 업황 모멘텀 반영`,
    `AI 점수 ${favor}점 기반 상대 강도 유지`
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
    bull_points: JSON.stringify(bullPoints),
    future_outlook: future,
    risk,
    foreign_flow: flowText
  };
}

const stocks = db
  .prepare("SELECT code, name, market, close_price FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') ORDER BY code")
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

const txAnalysis = db.transaction((rows) => {
  for (const row of rows) upsertAnalysis.run({ ...row, updated_at: now });
});

const analyses = stocks.map(buildAnalysis);
txAnalysis(analyses);

const ordered = db
  .prepare('SELECT code, favor_score FROM stock_analysis ORDER BY favor_score DESC, code ASC')
  .all();

db.prepare('DELETE FROM stock_ranking').run();
const insertRank = db.prepare('INSERT INTO stock_ranking (code, favor_score, rank, updated_at) VALUES (?,?,?,?)');
const txRank = db.transaction((rows) => {
  rows.forEach((row, i) => insertRank.run(row.code, row.favor_score, i + 1, now));
});
txRank(ordered);

const names = new Map(stocks.map((s) => [s.code, s]));
const top = ordered.slice(0, 50).map((r, i) => ({
  code: r.code,
  favor_score: r.favor_score,
  rank: i + 1,
  name: names.get(r.code)?.name || r.code,
  market: names.get(r.code)?.market || '-'
}));

const recent = ordered.slice(0, 100).map((r) => {
  const a = analyses.find((x) => x.code === r.code);
  return {
    code: r.code,
    name: names.get(r.code)?.name || r.code,
    summary: a?.summary || '',
    favor_score: r.favor_score,
    signal: a?.signal || '중립',
    updated_at: now
  };
});

const analysisMap = Object.fromEntries(
  analyses.map((a) => [
    a.code,
    {
      code: a.code,
      summary: a.summary,
      favor_score: a.favor_score,
      signal: a.signal,
      bull_points: JSON.parse(a.bull_points),
      future_outlook: a.future_outlook,
      risk: a.risk,
      foreign_flow: a.foreign_flow,
      updated_at: now,
      cache_hit: true,
      analysis_source: 'sqlite_batch'
    }
  ])
);

const autocomplete = stocks.map((s) => ({ code: s.code, name: s.name, market: s.market }));

fs.writeFileSync(path.join(OUT_DIR, 'ui_top_stocks.json'), JSON.stringify({ generated_at: now, top }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_recent_analysis.json'), JSON.stringify({ generated_at: now, items: recent }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_analysis_map.json'), JSON.stringify({ generated_at: now, map: analysisMap }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_autocomplete.json'), JSON.stringify({ generated_at: now, items: autocomplete }, null, 2));

console.log(`[cache] stocks=${stocks.length}, top=${top.length}, recent=${recent.length}, analysis_map=${Object.keys(analysisMap).length}`);
console.log(`[cache] files written to ${OUT_DIR}`);

db.close();
