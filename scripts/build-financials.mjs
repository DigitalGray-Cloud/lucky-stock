#!/usr/bin/env node
import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve('/home/user/luckstock');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'stocks.db');
const CORP_CODES_CACHE_PATH = path.join(DATA_DIR, 'dart_corp_codes.json');
const API_KEY = String(
  process.env.OPEN_DART_API_KEY ||
  process.env.DART_API_KEY ||
  process.env.OPENDART_API_KEY ||
  ''
).trim();
const USER_AGENT = 'LuckyStock-FinancialBatch/1.0';
const REPORT_CODE_NAMES = {
  '11011': '사업보고서',
  '11012': '반기보고서',
  '11013': '1분기보고서',
  '11014': '3분기보고서'
};
const FS_DIV_NAMES = {
  CFS: '연결재무제표',
  OFS: '별도재무제표'
};
const PROFITABILITY_INDEX_CODE = 'M210000';
const STABILITY_INDEX_CODE = 'M220000';

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { limit: 0, force: false };
  for (const arg of argv) {
    if (arg === '--force') opts.force = true;
    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1] || '0');
      if (Number.isFinite(value) && value > 0) opts.limit = Math.floor(value);
    }
  }
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/\(([^)]+)\)/g, '-$1')
    .replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '--') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatInteger(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num).toLocaleString('ko-KR') : '-';
}

function formatPercent(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : '-';
}

function formatMultiple(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}배` : '-';
}

function formatKoreanWon(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_0000_0000_0000) return `${sign}${(abs / 1_0000_0000_0000).toFixed(1)}조원`;
  if (abs >= 1_0000_0000) return `${sign}${(abs / 1_0000_0000).toFixed(1)}억원`;
  if (abs >= 1_0000) return `${sign}${(abs / 1_0000).toFixed(1)}만원`;
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}원`;
}

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, '').trim();
}

function buildDartUrl(endpoint, params) {
  return `https://opendart.fss.or.kr/api/${endpoint}?${new URLSearchParams(params).toString()}`;
}

async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, ms = 15000) {
  const res = await fetchWithTimeout(url, ms);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function downloadCorpCodesXml() {
  const url = buildDartUrl('corpCode.xml', { crtfc_key: API_KEY });
  const res = await fetchWithTimeout(url, 20000);
  if (!res.ok) throw new Error(`corpCode download failed: ${res.status}`);
  const zipBuffer = Buffer.from(await res.arrayBuffer());
  const zipPath = path.join(os.tmpdir(), `dart-corp-codes-${Date.now()}.zip`);
  fs.writeFileSync(zipPath, zipBuffer);
  try {
    return execFileSync('unzip', ['-p', zipPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}

function extractXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? String(match[1] || '').trim() : '';
}

function parseCorpCodesXml(xml = '') {
  const listBlocks = String(xml).match(/<list>[\s\S]*?<\/list>/gi) || [];
  return listBlocks
    .map((block) => ({
      corp_code: extractXmlTag(block, 'corp_code'),
      corp_name: extractXmlTag(block, 'corp_name'),
      stock_code: extractXmlTag(block, 'stock_code'),
      modify_date: extractXmlTag(block, 'modify_date')
    }))
    .filter((item) => /^\d{8}$/.test(item.corp_code) && /^\d{6}$/.test(item.stock_code));
}

function ensureSchema(db) {
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
`);

  const masterCols = db.prepare('PRAGMA table_info(stock_master)').all().map((c) => c.name);
  if (!masterCols.includes('corp_code')) db.exec(`ALTER TABLE stock_master ADD COLUMN corp_code TEXT`);
  if (!masterCols.includes('dart_corp_name')) db.exec(`ALTER TABLE stock_master ADD COLUMN dart_corp_name TEXT`);
  if (!masterCols.includes('listed_shares')) db.exec(`ALTER TABLE stock_master ADD COLUMN listed_shares INTEGER`);

  const analysisCols = db.prepare('PRAGMA table_info(stock_analysis)').all().map((c) => c.name);
  if (!analysisCols.includes('financial_metrics')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_metrics TEXT`);
  if (!analysisCols.includes('financial_summary')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_summary TEXT`);
  if (!analysisCols.includes('financial_source')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_source TEXT`);
  if (!analysisCols.includes('financial_updated_at')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_updated_at TEXT`);
}

function getReportCandidates(now = new Date()) {
  const year = now.getUTCFullYear();
  return [
    { bsnsYear: year - 1, reprtCode: '11011' },
    { bsnsYear: year - 1, reprtCode: '11014' },
    { bsnsYear: year - 1, reprtCode: '11012' },
    { bsnsYear: year - 1, reprtCode: '11013' },
    { bsnsYear: year - 2, reprtCode: '11011' }
  ];
}

function getAmountValue(item = {}, reportCode = '11011') {
  const isQuarterLike = reportCode !== '11011';
  const candidates = item?.sj_div === 'BS'
    ? [item.thstrm_amount, item.thstrm_add_amount]
    : isQuarterLike
      ? [item.thstrm_add_amount, item.thstrm_amount]
      : [item.thstrm_amount, item.thstrm_add_amount];

  for (const candidate of candidates) {
    const parsed = parseNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickAccountAmount(list = [], names = [], reportCode = '11011') {
  const candidates = names.map((name) => normalizeText(name));
  for (const item of list) {
    const accountName = normalizeText(item?.account_nm || '');
    if (!accountName || !candidates.includes(accountName)) continue;
    const amount = getAmountValue(item, reportCode);
    if (amount !== null) return amount;
  }
  return null;
}

function pickIndicator(list = [], names = []) {
  const candidates = names.map((name) => normalizeText(name));
  for (const item of list) {
    const idxName = normalizeText(item?.idx_nm || '');
    if (!idxName || !candidates.includes(idxName)) continue;
    const value = parseNumber(item?.idx_val);
    if (value !== null) return value;
  }
  return null;
}

async function fetchFinancialStatement(corpCode, reportCandidates) {
  for (const candidate of reportCandidates) {
    for (const fsDiv of ['CFS', 'OFS']) {
      const url = buildDartUrl('fnlttSinglAcntAll.json', {
        crtfc_key: API_KEY,
        corp_code: corpCode,
        bsns_year: String(candidate.bsnsYear),
        reprt_code: candidate.reprtCode,
        fs_div: fsDiv
      });
      const payload = await fetchJson(url);
      if (payload?.status === '000' && Array.isArray(payload.list) && payload.list.length) {
        return {
          list: payload.list,
          candidate,
          fsDiv,
          stlmDt: String(payload.list[0]?.stlm_dt || '').trim()
        };
      }
      if (payload?.status && payload.status !== '013') break;
      await sleep(35);
    }
  }
  return null;
}

async function fetchShareStatus(corpCode, candidate) {
  const url = buildDartUrl('stockTotqySttus.json', {
    crtfc_key: API_KEY,
    corp_code: corpCode,
    bsns_year: String(candidate.bsnsYear),
    reprt_code: candidate.reprtCode
  });
  const payload = await fetchJson(url);
  if (payload?.status !== '000' || !Array.isArray(payload.list)) return { listedShares: null, raw: [] };
  const totalRow = payload.list.find((item) => String(item?.se || '').includes('합계')) || payload.list[0] || null;
  return {
    listedShares: parseNumber(totalRow?.istc_totqy),
    raw: payload.list
  };
}

async function fetchIndexGroup(corpCode, candidate, idxClCode) {
  const url = buildDartUrl('fnlttSinglIndx.json', {
    crtfc_key: API_KEY,
    corp_code: corpCode,
    bsns_year: String(candidate.bsnsYear),
    reprt_code: candidate.reprtCode,
    idx_cl_code: idxClCode
  });
  const payload = await fetchJson(url);
  return payload?.status === '000' && Array.isArray(payload.list) ? payload.list : [];
}

function describeRoe(roe) {
  if (!Number.isFinite(roe)) return 'ROE는 자본을 얼마나 효율적으로 굴려 이익을 냈는지 보는 지표인데, 이번 기준값은 확인이 어렵습니다.';
  if (roe >= 15) return `ROE ${formatPercent(roe)}는 자기자본을 꽤 효율적으로 써서 이익을 만든 편으로 볼 수 있습니다.`;
  if (roe >= 8) return `ROE ${formatPercent(roe)}는 자본 대비 수익성이 무난한 편으로 해석할 수 있습니다.`;
  if (roe > 0) return `ROE ${formatPercent(roe)}는 이익은 내고 있지만 자본 효율이 강하다고 보긴 어려운 구간입니다.`;
  return `ROE ${formatPercent(roe)}는 적자이거나 자본 효율이 낮았다는 뜻에 가깝습니다.`;
}

function describeDebtRatio(debtRatio) {
  if (!Number.isFinite(debtRatio)) return '부채비율은 빚 부담을 보는 기본 지표인데, 이번 기준값은 확인이 어렵습니다.';
  if (debtRatio <= 100) return `부채비율 ${formatPercent(debtRatio)}는 자기자본 대비 빚 부담이 과도하다고 보긴 어려운 편입니다.`;
  if (debtRatio <= 200) return `부채비율 ${formatPercent(debtRatio)}는 감당은 가능하지만 불황 구간에 부담이 커질 수 있는 수준입니다.`;
  return `부채비율 ${formatPercent(debtRatio)}는 빚 의존도가 높은 편이라 실적이 흔들리면 주가도 더 민감해질 수 있습니다.`;
}

function describeOperatingMargin(operatingMargin) {
  if (!Number.isFinite(operatingMargin)) return '영업이익률은 본업에서 얼마를 남기는지 보는 지표인데, 이번 기준값은 확인이 어렵습니다.';
  if (operatingMargin >= 15) return `영업이익률 ${formatPercent(operatingMargin)}는 매출 대비 본업 수익성이 꽤 좋은 편입니다.`;
  if (operatingMargin >= 5) return `영업이익률 ${formatPercent(operatingMargin)}는 본업으로 일정 수준의 이익을 남기고 있다고 볼 수 있습니다.`;
  if (operatingMargin > 0) return `영업이익률 ${formatPercent(operatingMargin)}는 적자는 아니지만 마진이 얇아 원가나 매출 변화에 민감할 수 있습니다.`;
  return `영업이익률 ${formatPercent(operatingMargin)}는 본업에서 아직 손실이 나는 상태로 해석해야 합니다.`;
}

function describePerPbr(per, pbr) {
  const lines = [];
  if (Number.isFinite(per) && per > 0) {
    if (per <= 10) lines.push(`PER ${formatMultiple(per)}는 이익 대비 주가 부담이 아주 높다고 보긴 어려운 편입니다.`);
    else if (per <= 20) lines.push(`PER ${formatMultiple(per)}는 시장이 이 회사 이익에 어느 정도 기대를 반영하고 있는 보통 구간입니다.`);
    else lines.push(`PER ${formatMultiple(per)}는 현재 이익 대비 주가 기대가 꽤 반영된 편이라 기대가 꺾이면 부담이 커질 수 있습니다.`);
  } else {
    lines.push('PER은 적자이거나 EPS가 작아 해석력이 떨어지는 구간입니다.');
  }

  if (Number.isFinite(pbr) && pbr > 0) {
    if (pbr <= 1) lines.push(`PBR ${formatMultiple(pbr)}는 장부 순자산 대비 가격 부담이 낮은 편으로 볼 수 있습니다.`);
    else if (pbr <= 2) lines.push(`PBR ${formatMultiple(pbr)}는 순자산보다 웃돈이 붙어 있지만 아주 과한 수준으로 단정하긴 어렵습니다.`);
    else lines.push(`PBR ${formatMultiple(pbr)}는 시장이 순자산보다 높은 프리미엄을 붙이고 있다는 뜻이라 기대가 이미 많이 반영됐을 수 있습니다.`);
  } else {
    lines.push('PBR은 자본이 약하거나 음수인 경우 해석이 왜곡될 수 있습니다.');
  }
  return lines.join(' ');
}

function buildMetricsPayload(stock, statement, profitability, stability, shareStatus) {
  const reportCode = statement.candidate.reprtCode;
  const revenue = pickAccountAmount(statement.list, ['매출액', '영업수익', '수익(매출액)', '보험영업수익'], reportCode);
  const operatingIncome = pickAccountAmount(statement.list, ['영업이익'], reportCode);
  const netIncome = pickAccountAmount(statement.list, ['당기순이익', '분기순이익', '반기순이익'], reportCode);
  const assets = pickAccountAmount(statement.list, ['자산총계'], reportCode);
  const liabilities = pickAccountAmount(statement.list, ['부채총계'], reportCode);
  const equity = pickAccountAmount(statement.list, ['자본총계'], reportCode);
  const listedShares = shareStatus.listedShares;
  const eps = Number.isFinite(netIncome) && Number.isFinite(listedShares) && listedShares > 0 ? netIncome / listedShares : null;
  const bps = Number.isFinite(equity) && Number.isFinite(listedShares) && listedShares > 0 ? equity / listedShares : null;
  const price = Number(stock.close_price || 0);
  const per = Number.isFinite(price) && price > 0 && Number.isFinite(eps) && eps > 0 ? price / eps : null;
  const pbr = Number.isFinite(price) && price > 0 && Number.isFinite(bps) && bps > 0 ? price / bps : null;

  return {
    bsns_year: statement.candidate.bsnsYear,
    reprt_code: statement.candidate.reprtCode,
    reprt_name: REPORT_CODE_NAMES[statement.candidate.reprtCode] || statement.candidate.reprtCode,
    fs_div: statement.fsDiv,
    fs_name: FS_DIV_NAMES[statement.fsDiv] || statement.fsDiv,
    stlm_dt: statement.stlmDt || '',
    revenue,
    operating_income: operatingIncome,
    net_income: netIncome,
    assets,
    liabilities,
    equity,
    listed_shares: listedShares,
    roe: pickIndicator(profitability, ['ROE']),
    debt_ratio: pickIndicator(stability, ['부채비율']),
    operating_margin: pickIndicator(profitability, ['영업이익률']),
    eps,
    bps,
    per,
    pbr,
    close_price: Number.isFinite(price) && price > 0 ? price : null
  };
}

function buildFinancialSummary(stock, metrics) {
  const lines = [];
  lines.push('📊 재무제표 및 회사 성적표');
  lines.push(`${metrics.bsns_year}년 ${metrics.reprt_name} ${metrics.fs_name} 기준으로 보면 매출 ${formatKoreanWon(metrics.revenue)}, 영업이익 ${formatKoreanWon(metrics.operating_income)}, 순이익 ${formatKoreanWon(metrics.net_income)} 수준입니다.`);
  lines.push(`같은 기준에서 자산총계 ${formatKoreanWon(metrics.assets)}, 부채총계 ${formatKoreanWon(metrics.liabilities)}, 자본총계 ${formatKoreanWon(metrics.equity)}로 집계됩니다.`);
  lines.push('이 섹션은 초보자 기준으로 회사가 실제로 돈을 버는지, 빚 부담이 과한지, 현재 주가가 실적과 자산에 비해 비싼지 보는 기본 체력표입니다.');
  lines.push(describeRoe(metrics.roe));
  lines.push(describeDebtRatio(metrics.debt_ratio));
  lines.push(describeOperatingMargin(metrics.operating_margin));
  lines.push(`EPS ${Number.isFinite(metrics.eps) ? `${formatInteger(metrics.eps)}원` : '-'}, BPS ${Number.isFinite(metrics.bps) ? `${formatInteger(metrics.bps)}원` : '-'}로 계산되며, 이는 한 주당 이익과 한 주당 순자산이 어느 정도인지 보여줍니다.`);
  lines.push(describePerPbr(metrics.per, metrics.pbr));
  if (Number.isFinite(metrics.listed_shares)) {
    lines.push(`발행주식수는 ${formatInteger(metrics.listed_shares)}주 기준으로 계산했습니다.`);
  }
  if (metrics.stlm_dt) {
    lines.push(`숫자 기준일은 ${metrics.stlm_dt}입니다.`);
  }
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs();
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  ensureSchema(db);

  if (!API_KEY) {
    console.log('[financials] OPEN_DART_API_KEY/DART_API_KEY not set; schema only, skipping fetch.');
    db.close();
    return;
  }

  console.log('[financials] downloading DART corp codes...');
  const corpCodes = parseCorpCodesXml(await downloadCorpCodesXml());
  fs.writeFileSync(CORP_CODES_CACHE_PATH, JSON.stringify({ generated_at: new Date().toISOString(), items: corpCodes }, null, 2));

  const corpCodeMap = new Map(corpCodes.map((item) => [item.stock_code, item]));
  const updateCorpInfo = db.prepare(`
    UPDATE stock_master
    SET corp_code = @corp_code,
        dart_corp_name = @dart_corp_name
    WHERE code = @code
  `);
  const txCorp = db.transaction((rows) => {
    for (const row of rows) updateCorpInfo.run(row);
  });
  txCorp(
    db.prepare("SELECT code FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') ORDER BY code").all()
      .map((row) => {
        const item = corpCodeMap.get(String(row.code || ''));
        return item ? { code: row.code, corp_code: item.corp_code, dart_corp_name: item.corp_name } : null;
      })
      .filter(Boolean)
  );

  const targets = db.prepare(`
    SELECT sm.code, sm.name, sm.market, sm.close_price, sm.corp_code,
           sa.financial_updated_at
    FROM stock_master sm
    LEFT JOIN stock_analysis sa ON sa.code = sm.code
    WHERE sm.market IN ('KOSPI','KOSDAQ')
      AND sm.corp_code IS NOT NULL
      AND sm.corp_code <> ''
    ORDER BY sm.code ASC
  `).all();

  const todayKey = new Date().toISOString().slice(0, 10);
  const filteredTargets = targets.filter((row) => opts.force || String(row.financial_updated_at || '').slice(0, 10) !== todayKey);
  const runTargets = opts.limit > 0 ? filteredTargets.slice(0, opts.limit) : filteredTargets;

  const updateFinancials = db.prepare(`
    INSERT INTO stock_analysis (code, summary, favor_score, signal, bull_points, future_outlook, risk, foreign_flow, updated_at, financial_metrics, financial_summary, financial_source, financial_updated_at)
    VALUES (@code, '', 0, '', '[]', '', '', '', @updated_at, @financial_metrics, @financial_summary, @financial_source, @financial_updated_at)
    ON CONFLICT(code) DO UPDATE SET
      financial_metrics = excluded.financial_metrics,
      financial_summary = excluded.financial_summary,
      financial_source = excluded.financial_source,
      financial_updated_at = excluded.financial_updated_at
  `);
  const updateListedShares = db.prepare(`UPDATE stock_master SET listed_shares = @listed_shares WHERE code = @code`);

  console.log(`[financials] target=${runTargets.length} total_candidates=${targets.length}`);
  const reportCandidates = getReportCandidates();
  let success = 0;
  let missing = 0;
  let failed = 0;

  for (let i = 0; i < runTargets.length; i += 1) {
    const stock = runTargets[i];
    try {
      const statement = await fetchFinancialStatement(stock.corp_code, reportCandidates);
      if (!statement) {
        missing += 1;
        continue;
      }

      const shareStatus = await fetchShareStatus(stock.corp_code, statement.candidate);
      const profitability = await fetchIndexGroup(stock.corp_code, statement.candidate, PROFITABILITY_INDEX_CODE);
      const stability = await fetchIndexGroup(stock.corp_code, statement.candidate, STABILITY_INDEX_CODE);
      const metrics = buildMetricsPayload(stock, statement, profitability, stability, shareStatus);
      const summary = buildFinancialSummary(stock, metrics);
      const now = new Date().toISOString();

      updateFinancials.run({
        code: stock.code,
        updated_at: now,
        financial_metrics: JSON.stringify(metrics),
        financial_summary: summary,
        financial_source: 'opendart',
        financial_updated_at: now
      });
      if (Number.isFinite(metrics.listed_shares)) {
        updateListedShares.run({ code: stock.code, listed_shares: Math.round(metrics.listed_shares) });
      }
      success += 1;
    } catch (error) {
      failed += 1;
      console.warn(`[financials] ${stock.code} failed: ${error?.message || error}`);
    }

    if ((i + 1) % 25 === 0 || i + 1 === runTargets.length) {
      console.log(`[financials] progress ${i + 1}/${runTargets.length} success=${success} missing=${missing} failed=${failed}`);
    }
    await sleep(45);
  }

  db.close();
  console.log(`[financials] done success=${success} missing=${missing} failed=${failed}`);
}

main().catch((error) => {
  console.error('[financials] failed:', error?.message || error);
  process.exitCode = 1;
});
