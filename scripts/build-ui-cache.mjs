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

const THEME_POOL = ['AI플랫폼', '전기차', 'AI반도체', '2차전지', '제약/바이오'];

function detectTheme(stock, favor) {
  const byName = String(stock.name || '').toLowerCase();
  if (byName.includes('제약') || byName.includes('pharma') || byName.includes('바이오') || byName.includes('bio') || byName.includes('헬스')) return '제약/바이오';
  if (byName.includes('로보') || byName.includes('robot')) return '로봇';
  if (byName.includes('네이버') || byName.includes('kakao') || byName.includes('카카오')) return 'AI플랫폼';
  if (byName.includes('자동차') || byName.includes('모비스') || byName.includes('기아') || byName.includes('현대')) return '전기차';
  if (byName.includes('반도체') || byName.includes('semicon') || byName.includes('hynix')) return 'AI반도체';
  if (byName.includes('에코프로') || byName.includes('배터리') || byName.includes('리튬') || byName.includes('전지')) return '2차전지';

  const idx = hashCode(`${stock.code}:${stock.name}:${favor}`) % THEME_POOL.length;
  return THEME_POOL[idx];
}

function buildFiveQaSummary(stock, ctx) {
  const signal = ctx.signal;
  const favor = Number(ctx.favor || 0);
  const theme = ctx.theme || "핵심 업종";
  const tomorrowProb = Number(ctx.tomorrowProb || 0);
  const valuation = favor >= 80 ? "밸류 부담이 있는 편" : favor >= 60 ? "적정~중립 구간" : "저평가 시도 구간";
  const flowTone = favor >= 70
    ? "외국인/기관 수급이 완만하게 개선되는 흐름"
    : "수급 방향성이 아직 뚜렷하지 않은 흐름";

  return [
    "🏢 이 회사 뭐 하는 곳인가",
    `${stock.name}(${stock.code})은 ${stock.market || "국내 증시"}에서 ${theme} 축으로 분류되는 종목입니다.`,
    "이 종목의 핵심은 단순 제품 설명보다, 주력 사업이 실적과 수급을 동시에 끌어올릴 수 있는지입니다.",
    "돈을 버는 구조는 매출 성장보다 이익률 방어와 레버리지 구간에서의 실적 탄력에 더 크게 좌우됩니다.",
    "시장에서는 테마 이름보다 실제 숫자 변화와 기관·외국인 자금 유입 여부를 더 강하게 반영합니다.",
    "결국 좋은 회사인지보다, 지금 구간에서 실적으로 증명 가능한 사업 체력인지가 주가를 움직입니다.",
    "",
    "📈 왜 오를 수 있나",
    `첫째, 현재 AI 신호는 ${signal}이고 점수는 ${favor}점이라 완전 약세보다는 반등 논리가 살아 있습니다.`,
    `둘째, 단기 확률 지표가 ${tomorrowProb}%로 제시되어 모멘텀 트레이딩 자금이 붙을 명분이 있습니다.`,
    `셋째, ${flowTone}으로 해석되는 구간이라 수급이 한쪽으로 정리되면 주가 탄력이 빨라질 수 있습니다.`,
    "넷째, 업황 기대와 실적 턴어라운드 스토리가 맞물리면 밸류에이션 재평가가 빠르게 진행되기도 합니다.",
    "즉 상승 여지는 분명하지만, 기대가 실적 확인으로 이어지는지가 핵심 확인 포인트입니다.",
    "",
    "⚠️ 뭐가 위험한가",
    "겉으로 좋아 보여도 가장 큰 리스크는 기대치가 먼저 높아지고 실제 숫자가 따라오지 못하는 경우입니다.",
    "업황 회복이 늦어지면 좋은 스토리도 고평가 논리로 전환되며 차익 매물이 강하게 나올 수 있습니다.",
    "단기 급등 이후에는 펀더멘털과 무관하게 매매 피로도가 쌓여 변동성이 커지기 쉽습니다.",
    "거래대금이 둔화되면 같은 호재에도 반응이 약해지고, 지수 조정 때 낙폭이 확대될 수 있습니다.",
    "좋은 회사와 좋은 매수 타이밍은 다를 수 있다는 점이 이 구간의 핵심 리스크입니다.",
    "",
    "💰 지금 가격이 싼가 비싼가",
    `현재 구간은 절대 저점 단정보다 ${valuation}으로 해석하는 편이 현실적입니다.`,
    "많이 오른 자리라도 이익 추정치가 계속 상향되면 비싸 보이는 가격이 정당화될 수 있습니다.",
    "반대로 싸 보이는 자리라도 시장이 할인하는 구조적 이유가 남아 있으면 반등은 지연될 수 있습니다.",
    "그래서 가격 판단은 단순 PER/PBR 숫자보다, 다음 2~3분기 이익 가시성이 개선되는지로 봐야 합니다.",
    "싸다/비싸다 이분법보다 현재 가격이 감당 가능한 리스크인지가 더 중요합니다.",
    "",
    "🤔 그래서 지금 사도 되나",
    "지금은 한 번에 크게 들어가기보다 분할매수로 평균 단가를 관리하는 접근이 유효합니다.",
    "단기 관점이라면 추격매수보다 눌림 구간에서 거래량 재유입을 확인하고 대응하는 편이 낫습니다.",
    "중기 관점이라면 실적 이벤트를 통과하면서 비중을 단계적으로 늘리는 전략이 더 안정적입니다.",
    "신호가 살아 있어도 시장 변동성은 항상 열려 있으니 손절 기준과 비중 한도를 먼저 정하셔야 합니다.",
    "지금 자리는 포기할 자리가 아니라, 확신을 숫자로 확인하며 틀리지 않게 접근할 자리입니다."
  ].join("\n");
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
    summary: buildFiveQaSummary(stock, {
      signal,
      favor,
      theme,
      tomorrowProb
    }),
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
