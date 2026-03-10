/**
 * generate-ai-summaries.mjs
 * Claude API를 사용해 각 종목별 고유 분석 텍스트를 생성하고 DB에 저장합니다.
 *
 * 사용법:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-ai-summaries.mjs [options]
 *
 * 옵션:
 *   --force         이미 AI 생성된 종목도 재생성
 *   --limit N       처리할 종목 수 제한 (테스트용)
 *   --code XXXXX    특정 종목코드만 처리
 *   --concurrency N 동시 처리 수 (기본 15)
 */

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import path from 'node:path';

const ROOT = path.resolve('/home/user/luckstock');
const DB_PATH = path.join(ROOT, 'data', 'stocks.db');

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes('--force');
const LIMIT = (() => { const i = ARGS.indexOf('--limit'); return i >= 0 ? Number(ARGS[i + 1]) : 0; })();
const ONLY_CODE = (() => { const i = ARGS.indexOf('--code'); return i >= 0 ? ARGS[i + 1] : null; })();
const CONCURRENCY = (() => { const i = ARGS.indexOf('--concurrency'); return i >= 0 ? Number(ARGS[i + 1]) : 15; })();

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY 환경변수를 설정해주세요.');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });
const db = new Database(DB_PATH);

// summary_source 컬럼 추가 (없을 경우)
const analysisCols = db.prepare('PRAGMA table_info(stock_analysis)').all().map(c => c.name);
if (!analysisCols.includes('summary_source')) {
  db.exec(`ALTER TABLE stock_analysis ADD COLUMN summary_source TEXT DEFAULT 'template'`);
  console.log('[init] summary_source 컬럼 추가됨');
}

const updateSummary = db.prepare(`
  UPDATE stock_analysis
  SET summary = @summary, summary_source = 'ai', updated_at = @updated_at
  WHERE code = @code
`);

function buildPrompt(stock) {
  const changeDir = stock.change_rate > 0 ? `+${stock.change_rate.toFixed(2)}%` : `${stock.change_rate.toFixed(2)}%`;
  const volumeK = stock.volume > 0 ? `${(stock.volume / 1000).toFixed(0)}천주` : '정보없음';
  const priceStr = stock.close_price > 0 ? `${stock.close_price.toLocaleString()}원` : '정보없음';

  return `당신은 한국 주식 시장 전문 애널리스트입니다.
아래 종목에 대해 투자자가 읽기 쉽고 실용적인 5개 섹션 분석을 한국어로 작성해주세요.

종목명: ${stock.name}
종목코드: ${stock.code}
시장: ${stock.market}
업종테마: ${stock.theme}
현재가: ${priceStr}
전일대비: ${changeDir}
거래량: ${volumeK}
52주 고가/저가: ${stock.high_price?.toLocaleString() || '?'}원 / ${stock.low_price?.toLocaleString() || '?'}원

각 섹션을 정확히 아래 형식으로 작성하세요. 각 섹션은 4~6문장으로 구성하며, 이 종목만의 구체적인 내용을 담아야 합니다.

🏢 이 회사 뭐 하는 곳인가
(${stock.name}가 실제로 어떤 사업을 하는지, 주요 제품/서비스, 매출 구조, 업계 내 위치를 구체적으로 설명하세요. 회사명과 업종에서 유추 가능한 내용을 활용하세요.)

📈 왜 오를 수 있나
(이 종목에 특화된 상승 촉매 요인 4~5가지를 구체적으로 설명하세요. 업종 트렌드, 실적 개선 가능성, 수급 특성을 포함하세요.)

⚠️ 뭐가 위험한가
(이 종목 특유의 리스크 요인 4~5가지를 구체적으로 설명하세요. 업종 리스크, 경쟁 구도, 재무 취약점 등을 포함하세요.)

💰 지금 가격이 싼가 비싼가
(현재 주가 ${priceStr} 기준으로 밸류에이션 판단을 구체적으로 설명하세요. 업종 평균 대비, PER/PBR 관점, 이익 가시성 등을 포함하세요.)

🤔 그래서 지금 사도 되나
(구체적인 매매 전략과 타이밍을 제시하세요. 단기/중기 관점, 매수 조건, 손절 기준을 포함하세요.)

주의: 각 섹션 제목(이모지 포함)을 반드시 그대로 사용하고, 섹션 사이에 빈 줄을 하나 넣으세요. 모든 내용은 ${stock.name}에 특화된 정보여야 합니다.`;
}

async function generateSummary(stock) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(stock) }]
  });
  return msg.content[0].text.trim();
}

async function processBatch(stocks) {
  const results = await Promise.allSettled(stocks.map(async (stock) => {
    try {
      const summary = await generateSummary(stock);
      updateSummary.run({ code: stock.code, summary, updated_at: new Date().toISOString() });
      return { code: stock.code, ok: true };
    } catch (err) {
      return { code: stock.code, ok: false, error: err.message };
    }
  }));
  return results.map(r => r.value || { ok: false, error: r.reason?.message });
}

// 처리할 종목 목록 조회
let query = `
  SELECT sm.code, sm.name, sm.market, sm.close_price, sm.change_rate, sm.volume, sm.high_price, sm.low_price,
         COALESCE(sa.theme, '기타') as theme,
         COALESCE(sa.summary_source, 'template') as summary_source
  FROM stock_master sm
  LEFT JOIN stock_analysis sa ON sm.code = sa.code
  WHERE sm.market IN ('KOSPI', 'KOSDAQ')
`;
if (ONLY_CODE) {
  query += ` AND sm.code = '${ONLY_CODE}'`;
} else if (!FORCE) {
  query += ` AND (sa.summary_source IS NULL OR sa.summary_source != 'ai')`;
}
query += ` ORDER BY sm.code`;
if (LIMIT > 0) query += ` LIMIT ${LIMIT}`;

const stocks = db.prepare(query).all();
const total = stocks.length;

if (total === 0) {
  console.log('처리할 종목이 없습니다. --force 옵션으로 재생성하거나 --code로 특정 종목을 지정하세요.');
  db.close();
  process.exit(0);
}

console.log(`[start] 총 ${total}개 종목 AI 분석 생성 시작 (동시처리: ${CONCURRENCY})`);
console.log(`[info] 예상 소요: ~${Math.ceil(total / CONCURRENCY * 2)}초, 예상 비용: ~$${(total * 0.004).toFixed(2)}`);

let done = 0;
let errors = 0;
const startTime = Date.now();

for (let i = 0; i < total; i += CONCURRENCY) {
  const batch = stocks.slice(i, i + CONCURRENCY);
  const results = await processBatch(batch);

  for (const r of results) {
    done++;
    if (!r.ok) {
      errors++;
      console.error(`  [ERROR] ${r.code}: ${r.error}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const pct = ((done / total) * 100).toFixed(1);
  const eta = done > 0 ? ((Date.now() - startTime) / done * (total - done) / 1000).toFixed(0) : '?';
  process.stdout.write(`\r[${pct}%] ${done}/${total} 완료 | 오류: ${errors} | 경과: ${elapsed}s | 남은: ${eta}s  `);
}

console.log(`\n[done] ${done}개 처리 완료 (성공: ${done - errors}, 오류: ${errors})`);
console.log(`[done] 총 소요시간: ${((Date.now() - startTime) / 1000).toFixed(1)}초`);

if (errors === 0) {
  console.log('\n다음 단계: node scripts/build-ui-cache.mjs 를 실행해 JSON 캐시를 갱신하세요.');
}

db.close();
