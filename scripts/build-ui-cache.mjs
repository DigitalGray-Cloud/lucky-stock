import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('/home/user/luckstock');
const DB_PATH = path.join(ROOT, 'data', 'stocks.db');
const OUT_DIR = path.join(ROOT, 'data');
const NEWS_MAP_PATH = path.join(OUT_DIR, 'ui_news_map.json');
const HOME_TODAY_PATH = path.join(OUT_DIR, 'ui_home_today.json');
const HOME_TOMORROW_PATH = path.join(OUT_DIR, 'ui_home_tomorrow.json');
const HOME_SIGNAL_PATH = path.join(OUT_DIR, 'ui_home_signal.json');
const HOME_EXPOSURE_HISTORY_PATH = path.join(OUT_DIR, 'ui_home_exposure_history.json');

const BLUE_CHIP_CODES = new Set([
  '005930', // 삼성전자
  '000660', // SK하이닉스
  '373220', // LG에너지솔루션
  '207940', // 삼성바이오로직스
  '005380', // 현대차
  '068270', // 셀트리온
  '105560', // KB금융
  '000270', // 기아
  '035420', // NAVER
  '012330'  // 현대모비스
]);

const HARD_EXCLUDED_CODES = new Set([
  '059090', // 미코
  '122310'  // 제노레이
]);

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

// stock_master 누락 컬럼 추가 (build-stock-master.mjs와 동기화)
const masterCols = db.prepare('PRAGMA table_info(stock_master)').all().map((c) => c.name);
if (!masterCols.includes('prev_price'))   db.exec(`ALTER TABLE stock_master ADD COLUMN prev_price INTEGER`);
if (!masterCols.includes('change_rate'))  db.exec(`ALTER TABLE stock_master ADD COLUMN change_rate REAL`);
if (!masterCols.includes('volume'))       db.exec(`ALTER TABLE stock_master ADD COLUMN volume INTEGER`);
if (!masterCols.includes('high_price'))   db.exec(`ALTER TABLE stock_master ADD COLUMN high_price INTEGER`);
if (!masterCols.includes('low_price'))    db.exec(`ALTER TABLE stock_master ADD COLUMN low_price INTEGER`);

// stock_analysis 누락 컬럼 추가 (하위 호환)
const analysisCols = db.prepare('PRAGMA table_info(stock_analysis)').all().map((c) => c.name);
if (!analysisCols.includes('signal_emoji'))   db.exec(`ALTER TABLE stock_analysis ADD COLUMN signal_emoji TEXT`);
if (!analysisCols.includes('trigger_count'))  db.exec(`ALTER TABLE stock_analysis ADD COLUMN trigger_count INTEGER`);
if (!analysisCols.includes('tomorrow_prob'))  db.exec(`ALTER TABLE stock_analysis ADD COLUMN tomorrow_prob INTEGER`);
if (!analysisCols.includes('prob_1m'))        db.exec(`ALTER TABLE stock_analysis ADD COLUMN prob_1m INTEGER`);
if (!analysisCols.includes('prob_3m'))        db.exec(`ALTER TABLE stock_analysis ADD COLUMN prob_3m INTEGER`);
if (!analysisCols.includes('prob_1y'))        db.exec(`ALTER TABLE stock_analysis ADD COLUMN prob_1y INTEGER`);
if (!analysisCols.includes('confidence'))     db.exec(`ALTER TABLE stock_analysis ADD COLUMN confidence INTEGER`);
if (!analysisCols.includes('theme'))          db.exec(`ALTER TABLE stock_analysis ADD COLUMN theme TEXT`);
if (!analysisCols.includes('risk_points'))    db.exec(`ALTER TABLE stock_analysis ADD COLUMN risk_points TEXT`);
if (!analysisCols.includes('signal_flags'))   db.exec(`ALTER TABLE stock_analysis ADD COLUMN signal_flags TEXT`);
if (!analysisCols.includes('summary_source')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN summary_source TEXT DEFAULT 'template'`);
if (!analysisCols.includes('financial_metrics')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_metrics TEXT`);
if (!analysisCols.includes('financial_summary')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_summary TEXT`);
if (!analysisCols.includes('financial_source')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_source TEXT`);
if (!analysisCols.includes('financial_updated_at')) db.exec(`ALTER TABLE stock_analysis ADD COLUMN financial_updated_at TEXT`);

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

function getKstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function getPreviousKstDateKey(dateKey = getKstDateKey()) {
  const dt = new Date(`${dateKey}T00:00:00+09:00`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return getKstDateKey(dt);
}

function getRecentKstDateKeys(endDateKey = getKstDateKey(), days = 7, includeEnd = false) {
  const keys = [];
  let cursor = includeEnd ? endDateKey : getPreviousKstDateKey(endDateKey);
  for (let i = 0; i < days; i += 1) {
    keys.push(cursor);
    cursor = getPreviousKstDateKey(cursor);
  }
  return keys;
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createEmptyExposureHistory() {
  return {
    generated_at: '',
    daily: {
      today: {},
      tomorrow: {},
      signal: {}
    }
  };
}

function loadExposureHistory() {
  const history = readJsonFile(HOME_EXPOSURE_HISTORY_PATH, createEmptyExposureHistory());
  history.daily = history.daily || {};
  history.daily.today = history.daily.today || {};
  history.daily.tomorrow = history.daily.tomorrow || {};
  history.daily.signal = history.daily.signal || {};
  return history;
}

function getExposureCodes(history, listKey, dateKey) {
  const items = history?.daily?.[listKey]?.[dateKey];
  return new Set(Array.isArray(items) ? items.map((code) => String(code || '')).filter(Boolean) : []);
}

function getExposureCodesForRecentDays(history, listKey, endDateKey, days = 7, includeEnd = false) {
  const codes = new Set();
  for (const dateKey of getRecentKstDateKeys(endDateKey, days, includeEnd)) {
    for (const code of getExposureCodes(history, listKey, dateKey)) {
      codes.add(code);
    }
  }
  return codes;
}

function getExposureCodesForAllLists(history, endDateKey, days = 7, includeEnd = false) {
  const codes = new Set();
  for (const listKey of ['today', 'tomorrow', 'signal']) {
    for (const code of getExposureCodesForRecentDays(history, listKey, endDateKey, days, includeEnd)) {
      codes.add(code);
    }
  }
  return codes;
}

function mergeExposureCodes(history, listKey, dateKey, items) {
  const bucket = history.daily[listKey];
  const current = getExposureCodes(history, listKey, dateKey);
  for (const item of items || []) {
    const code = String(item?.code || '');
    if (code) current.add(code);
  }
  bucket[dateKey] = [...current];
}

function pruneExposureHistory(history, keepDays = 20) {
  for (const key of ['today', 'tomorrow', 'signal']) {
    const entries = Object.entries(history.daily[key] || {}).sort((a, b) => b[0].localeCompare(a[0]));
    history.daily[key] = Object.fromEntries(entries.slice(0, keepDays));
  }
}

function isBlueChip(code) {
  return BLUE_CHIP_CODES.has(String(code || ''));
}

function isHardExcludedCode(code) {
  return HARD_EXCLUDED_CODES.has(String(code || ''));
}

function uniqueByCode(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const code = String(item?.code || '');
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

function selectFreshItems(candidates, count, excludedCodes = new Set()) {
  const picked = [];
  const seen = new Set();
  for (const item of uniqueByCode(candidates)) {
    const code = String(item?.code || '');
    if (!code || seen.has(code)) continue;
    if (excludedCodes.has(code) && !isBlueChip(code)) continue;
    seen.add(code);
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
}

function fillRemainingItems(baseItems, candidates, count, excludedCodes = new Set()) {
  const picked = [...(baseItems || [])];
  const seen = new Set(picked.map((item) => String(item?.code || '')).filter(Boolean));

  for (const item of uniqueByCode(candidates)) {
    const code = String(item?.code || '');
    if (!code || seen.has(code) || excludedCodes.has(code)) continue;
    picked.push(item);
    seen.add(code);
    if (picked.length >= count) break;
  }

  return picked;
}

function fillRemainingItemsIfNeeded(baseItems, candidates, count, excludedCodes = new Set()) {
  if ((baseItems || []).length >= count) return (baseItems || []).slice(0, count);
  return fillRemainingItems(baseItems, candidates, count, excludedCodes);
}

function pickFirstFreshByTheme(candidates, theme, excludedCodes, selectedCodes) {
  return candidates.find((item) => {
    const code = String(item?.code || '');
    if (!code || selectedCodes.has(code)) return false;
    if (item.theme !== theme) return false;
    if (excludedCodes.has(code) && !isBlueChip(code)) return false;
    return true;
  }) || null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { mode: 'full', resetAiSummaries: false };
  for (const arg of argv) {
    if (arg.startsWith('--mode=')) opts.mode = String(arg.split('=')[1] || 'full');
    if (arg === '--reset-ai-summaries') opts.resetAiSummaries = true;
  }
  return opts;
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

// 종목명 키워드 → 섹터 매핑 (우선순위 순)
const THEME_RULES = [
  // 2차전지
  { theme: '2차전지',    keywords: ['에코프로', '배터리', '리튬', '전지', '양극재', '음극재', '전해질', '엘앤에프', 'posco홀딩스'] },
  // AI반도체
  { theme: 'AI반도체',   keywords: ['반도체', 'semicon', 'hynix', '하이닉스', '에스케이하이', 'db하이텍', '리노공업', '원익', '테스나', '하나마이크론', '두산테스나', '피에스케이', '삼성전자', '삼성sdi', '삼성전기', 'sk실트론'] },
  // AI/플랫폼
  { theme: 'AI플랫폼',   keywords: ['네이버', 'kakao', '카카오', '크래프톤', '넥슨', '엔씨', '펄어비스', '위메이드', '소프트', '아이티', 'ai', 'it', '솔루션', '시스템'] },
  // 로봇
  { theme: '로봇',       keywords: ['로봇', 'robot', '로보', '두산로보', '레인보우'] },
  // 제약/바이오
  { theme: '제약/바이오', keywords: ['제약', 'pharma', '바이오', 'bio', '헬스', '메디', '셀', '팜', '치료', '의약', '신약', '항암', '진단', '의료기기', '테라퓨틱', '생명과학'] },
  // 전기차
  { theme: '전기차',     keywords: ['전기차', '충전', 'ev충', '자율주행'] },
  // 자동차/부품
  { theme: '자동차',     keywords: ['자동차', '모비스', '만도', '현대위아', '에이치엘만도', '자동차부품', '차량'] },
  // 항공
  { theme: '항공',       keywords: ['항공', '에어', '아시아나', '제주에어', '진에어', '티웨이', '에어부산'] },
  // 해운/물류
  { theme: '해운/물류',  keywords: ['해운', '물류', '택배', '팬오션', 'hlmm', '에이치엠엠', '대한해운', '흥아해운', '장금상선'] },
  // 철강/소재
  { theme: '철강/소재',  keywords: ['철강', '포스코', '제철', '스틸', '현대제철', '동국제강', '세아', '고려아연', '풍산'] },
  // 화학
  { theme: '화학',       keywords: ['화학', '케미칼', '케미', '폴리', '수지', '롯데케미칼', 'sk케미칼', '금호석유', '효성화학'] },
  // 에너지
  { theme: '에너지',     keywords: ['에너지', '가스', '발전', '석유', '한국전력', '한전', '가스공사', 's-oil', '오일'] },
  // 건설/부동산
  { theme: '건설',       keywords: ['건설', '건축', '개발', '주택', '엔지니어링', '현대건설', '대림', 'gs건설', '포스코이앤씨', '디엘이앤씨'] },
  // 금융
  { theme: '금융',       keywords: ['은행', '증권', '보험', '금융', '캐피탈', '저축은행', '카드', '투자', '자산운용', '신한', '하나금융', 'kb금융', '우리금융', '기업은행', '미래에셋'] },
  // 유통/소매
  { theme: '유통',       keywords: ['이마트', '롯데', '백화점', '마트', '홈쇼핑', '편의점', 'gs리테일', '이랜드', 'cj대한통운', '쿠팡'] },
  // 식품/음료
  { theme: '식품',       keywords: ['식품', '음료', '제과', '주류', '빙과', '냉동', 'cj제일제당', '오리온', '농심', '빙그레', '롯데칠성', '하이트진로', '오비맥주', '삼양식품'] },
  // 통신
  { theme: '통신',       keywords: ['통신', '텔레콤', 'skt', 'kt', '엘지유플', 'lg유플'] },
  // 게임/엔터
  { theme: '게임/엔터',  keywords: ['게임', '엔터', '콘텐츠', '미디어', '엔터테인', '하이브', 'sm엔터', 'jyp', '와이지', '영화', '드라마'] },
  // 여행/관광
  { theme: '여행/관광',  keywords: ['여행', '관광', '호텔', '리조트', '면세'] },
  // 반도체 장비/소재
  { theme: '반도체장비', keywords: ['장비', '노광', '식각', '증착', '세정', 'aps홀딩스', '피에스케이', '주성엔지', '원익ips', '테스', '유진테크'] },
];

function detectTheme(stock) {
  const n = String(stock.name || '').toLowerCase();
  for (const rule of THEME_RULES) {
    if (rule.keywords.some((k) => n.includes(k.toLowerCase()))) {
      return rule.theme;
    }
  }
  // 매칭 실패 시 무작위 배정 대신 '기타' 반환
  return '기타';
}

const COMPANY_INTRO_OVERRIDES = {
  '005930': [
    '삼성전자는 반도체, 스마트폰, 가전, 디스플레이 등 국내 대표 IT 제조 사업을 영위하는 기업입니다.',
    '국내 대형 수출주 가운데 하나로, 실적은 메모리 업황과 IT 수요 변화에 큰 영향을 받습니다.'
  ],
  '000660': [
    'SK하이닉스는 D램과 낸드플래시를 중심으로 하는 글로벌 메모리 반도체 기업입니다.',
    '실적과 주가 방향은 서버, AI, 모바일 수요와 메모리 업황 사이클의 영향을 크게 받습니다.'
  ],
  '035420': [
    'NAVER는 검색, 커머스, 콘텐츠, 클라우드 등 인터넷 플랫폼 사업을 영위하는 기업입니다.',
    '광고와 커머스 성장, 비용 통제가 실적 해석의 핵심 축입니다.'
  ],
  '020560': [
    '아시아나항공은 국내외 여객 및 화물 노선을 운영하는 국내 대형 항공사 중 하나입니다.',
    '항공 수요, 운임, 유가, 환율과 같은 변수들이 실적과 주가 흐름에 직접 영향을 줍니다.'
  ],
  '000250': [
    '삼천당제약은 의약품 개발·생산·판매와 바이오 파이프라인 사업을 함께 보는 제약·바이오 기업입니다.',
    '주가 해석에서는 개별 품목과 파이프라인이 실제 매출과 이익으로 이어지는지가 핵심입니다.'
  ]
};

const THEME_INTRO_MAP = {
  '항공': [
    '국내외 여객 및 화물 운송을 운영하는 항공 관련 기업입니다.',
    '운임, 유가, 환율, 여행 수요 변화가 실적과 주가에 직접 연결되는 업종입니다.'
  ],
  '제약/바이오': [
    '의약품 개발·생산·판매와 바이오 파이프라인을 주요 사업으로 보는 기업입니다.',
    '개별 품목, 허가, 기술이전, 매출 인식 여부가 기업가치 해석에서 중요합니다.'
  ],
  'AI반도체': [
    '반도체와 관련 부품·소재·장비 또는 IT 제조를 핵심 사업으로 보는 기업입니다.',
    '메모리 업황, 설비투자, 고객사 수요 변화가 실적 해석에 중요한 변수입니다.'
  ],
  'AI플랫폼': [
    '플랫폼, 소프트웨어, 인터넷 서비스, 콘텐츠 등 디지털 서비스 사업을 영위하는 기업입니다.',
    '트래픽, 광고, 구독, 커머스 등 핵심 지표가 실적과 밸류에이션에 영향을 줍니다.'
  ],
  '2차전지': [
    '배터리 소재, 셀, 장비, 부품 등 2차전지 밸류체인에 속한 기업입니다.',
    '전방 수요와 원재료 가격, 증설 속도가 실적 방향에 큰 영향을 줍니다.'
  ],
  '전기차': [
    '전기차와 관련 부품·충전·자율주행 밸류체인에서 사업을 영위하는 기업입니다.',
    '완성차 수요와 전동화 투자 흐름이 핵심 변수로 작용합니다.'
  ],
  '자동차': [
    '완성차 또는 자동차 부품 사업을 영위하는 기업입니다.',
    '판매량, 환율, 원가, 신차 효과가 실적과 주가를 좌우하는 편입니다.'
  ],
  '로봇': [
    '산업용·서비스용 로봇 또는 자동화 장비 사업을 영위하는 기업입니다.',
    '고객사 투자 사이클과 신규 수주 흐름이 실적 해석의 핵심입니다.'
  ],
  '반도체장비': [
    '반도체 공정 장비·소재 공급을 핵심으로 하는 기업입니다.',
    '고객사 설비투자와 수주 인식 속도가 실적에 큰 영향을 줍니다.'
  ],
  '철강/소재': [
    '철강, 비철, 소재 생산과 가공을 주요 사업으로 보는 기업입니다.',
    '제품 스프레드와 업황, 원재료 가격이 수익성에 직접 연결됩니다.'
  ],
  '화학': [
    '석유화학, 정밀화학, 소재 사업을 영위하는 기업입니다.',
    '제품 가격, 원재료 비용, 업황 사이클이 실적에 큰 영향을 줍니다.'
  ],
  '에너지': [
    '발전, 가스, 정유, 에너지 설비 등 에너지 관련 사업을 영위하는 기업입니다.',
    '국제 에너지 가격과 정책 변수에 민감한 편입니다.'
  ],
  '금융': [
    '은행, 증권, 보험, 카드 등 금융 서비스를 제공하는 기업입니다.',
    '금리, 건전성, 대손비용, 자본정책이 기업가치 해석의 핵심입니다.'
  ],
  '유통': [
    '오프라인·온라인 유통과 소비재 판매를 주요 사업으로 하는 기업입니다.',
    '소비 경기와 점포/채널 경쟁력이 실적에 직접 반영됩니다.'
  ],
  '식품': [
    '식품, 음료, 외식 또는 원재료 가공 사업을 영위하는 기업입니다.',
    '원가 부담과 브랜드 판매력이 수익성에 중요하게 작용합니다.'
  ],
  '게임/엔터': [
    '게임, 음악, 영상, 콘텐츠 등 IP 기반 사업을 영위하는 기업입니다.',
    '신작 흥행과 팬덤 확장, 콘텐츠 성과가 실적 변동의 핵심입니다.'
  ],
  '건설': [
    '건설, 주택, 플랜트, 엔지니어링 사업을 영위하는 기업입니다.',
    '수주, 원가율, 부동산 경기와 프로젝트 진행 속도가 실적에 중요합니다.'
  ],
  '해운/물류': [
    '해운, 물류, 운송 서비스를 주요 사업으로 하는 기업입니다.',
    '운임과 물동량, 글로벌 경기 흐름이 실적에 직접 연결됩니다.'
  ],
  '통신': [
    '무선·유선 통신과 네트워크 기반 서비스를 제공하는 기업입니다.',
    '가입자 지표와 투자비, 요금 정책이 수익성에 영향을 줍니다.'
  ],
  '기타': [
    '국내 증시에서 자체 사업 포트폴리오를 바탕으로 영업하는 상장사입니다.',
    '주가 해석에서는 개별 사업부 실적과 기업 고유 이슈를 함께 보는 편이 맞습니다.'
  ]
};

function buildCompanyIntro(stock, theme) {
  const override = COMPANY_INTRO_OVERRIDES[stock.code];
  if (override) {
    return [
      '🏢 이 회사 뭐 하는 곳인가',
      ...override
    ].join('\n');
  }

  const intro = THEME_INTRO_MAP[theme] || THEME_INTRO_MAP['기타'];
  return [
    '🏢 이 회사 뭐 하는 곳인가',
    `${stock.name}(${stock.code})은 ${stock.market || '국내 증시'} 상장사로, ${intro[0]}`,
    intro[1]
  ].join('\n');
}

function normalizeNewsTitle(title = '') {
  return String(title)
    .replace(/\s+/g, ' ')
    .replace(/\[[^\]]+\]/g, '')
    .trim();
}

function parseNewsDate(dateText = '') {
  const t = Date.parse(String(dateText || ''));
  return Number.isFinite(t) ? t : null;
}

function daysAgoFrom(dateText = '') {
  const ts = parseNewsDate(dateText);
  if (!ts) return 9999;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function isLowSignalMarketWrap(title = '') {
  const t = normalizeNewsTitle(title).toLowerCase();
  return [
    '주가',
    '장중',
    '마감',
    '상승',
    '하락',
    '급등',
    '강세',
    '약세',
    '거래량',
    '수급',
    '시황',
    '특징주'
  ].some((x) => t.includes(x));
}

function classifyHeadline(title = '') {
  const t = normalizeNewsTitle(title).toLowerCase();
  const strong = [
    ['계약', 4, '계약'],
    ['파트너십', 4, '파트너십'],
    ['공급', 4, '공급'],
    ['수주', 4, '수주'],
    ['승인', 4, '허가'],
    ['허가', 4, '허가'],
    ['임상', 4, '임상'],
    ['매출', 3, '실적'],
    ['영업이익', 3, '실적'],
    ['흑자', 3, '실적'],
    ['실적', 3, '실적'],
    ['출시', 3, '출시'],
    ['수출', 3, '수출'],
    ['기술이전', 4, '기술이전'],
    ['로열티', 4, '로열티'],
    ['po', 3, '주문'],
    ['구매주문', 3, '주문'],
    ['mou', 2, '제휴'],
    ['투자유치', 3, '투자'],
    ['증설', 3, '증설'],
    ['신제품', 2, '신제품'],
  ];

  let score = 0;
  let tag = '일반';
  let sentiment = 0;
  for (const [keyword, weight, type] of strong) {
    if (t.includes(keyword)) {
      score += weight;
      tag = type;
      sentiment += 1;
    }
  }

  const negativeKeywords = [
    '관리종목',
    '상장적격성',
    '실질심사',
    '우려',
    '논란',
    '해명',
    '정정',
    '불성실',
    '과징금',
    '조사',
    '소송',
    '하한가',
    '적자',
    '부진',
    '실패',
    '취소',
    '연기',
    '지연',
    '해지',
    '뻥튀기',
    '없던 숫자',
    '급락'
  ];
  for (const keyword of negativeKeywords) {
    if (t.includes(keyword)) {
      score -= 3;
      sentiment -= 2;
    }
  }

  if (isLowSignalMarketWrap(t)) score -= 3;
  if (t.includes('루머') || t.includes('설')) score -= 2;

  return { score, tag, sentiment };
}

function dedupeNewsItems(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const title = normalizeNewsTitle(item.title || '');
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, title });
  }
  return out;
}

function summarizeDate(dateText = '') {
  const ts = parseNewsDate(dateText);
  if (!ts) return '날짜 확인 필요';
  return new Date(ts).toISOString().slice(0, 10);
}

function buildNewsContext(stock, newsItems = []) {
  const deduped = dedupeNewsItems(newsItems)
    .map((item) => {
      const cls = classifyHeadline(item.title);
      const daysAgo = daysAgoFrom(item.date);
      const recencyBonus = daysAgo <= 7 ? 3 : daysAgo <= 21 ? 2 : daysAgo <= 45 ? 1 : 0;
      return {
        ...item,
        tag: cls.tag,
        sentiment: cls.sentiment,
        headline_score: cls.score,
        relevance: cls.score + recencyBonus,
        daysAgo,
      };
    })
    .sort((a, b) => b.relevance - a.relevance || a.daysAgo - b.daysAgo);

  const relevant = deduped.filter((item) => item.relevance > 0);
  const top = relevant.slice(0, 3);
  const positiveCount = top.filter((item) => item.sentiment > 0).length;
  const negativeCount = top.filter((item) => item.sentiment < 0).length;

  let grade = 'C';
  if (positiveCount >= 2 && negativeCount === 0 && top.length >= 2 && top[0].relevance >= 6) grade = 'A';
  else if (positiveCount >= 1 && negativeCount <= 1 && top.length >= 1 && top[0].relevance >= 3) grade = 'B';

  const tags = Array.from(new Set(top.map((item) => item.tag).filter(Boolean)));
  const tone = negativeCount > positiveCount ? 'negative' : negativeCount > 0 ? 'mixed' : positiveCount > 0 ? 'positive' : 'neutral';
  return { grade, tone, all: deduped, top, tags };
}

function includesAny(text, keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractHeadlineSignals(title = '', theme = '') {
  const t = normalizeNewsTitle(title).toLowerCase();
  const signals = new Set();

  if (includesAny(t, ['세마글루타이드', '위고비', 'ozempic', 'wegovy', '리벨서스', 'glp-1', '비만', '당뇨'])) {
    signals.add('obesity_drug');
  }
  if (includesAny(t, ['경구용', '먹는', 'oral'])) signals.add('oral_formulation');
  if (includesAny(t, ['독점', 'exclusive', '판권', '라이선스', 'license'])) signals.add('exclusive_license');
  if (includesAny(t, ['기술이전', '로열티', '마일스톤'])) signals.add('tech_transfer');
  if (includesAny(t, ['계약', '파트너십', '공급', '수주', 'po', '구매주문'])) signals.add('commercial_contract');
  if (includesAny(t, ['허가', '승인', '임상', '3상', '2상', '1상'])) signals.add('regulatory_step');
  if (includesAny(t, ['매출', '영업이익', '흑자', '실적', '턴어라운드'])) signals.add('earnings_turn');
  if (includesAny(t, ['출시', '출하', '양산', '초도', '상용화'])) signals.add('commercial_launch');
  if (includesAny(t, ['hbm', 'ai 반도체', '엔비디아', 'nvidia', '고대역폭메모리'])) signals.add('ai_memory');
  if (includesAny(t, ['데이터센터', '서버', '클라우드'])) signals.add('datacenter_demand');
  if (includesAny(t, ['방산', '미사일', '포탄', '탄약', '천궁', 'k2', 'fa-50', '폴란드', '중동'])) signals.add('defense_export');
  if (includesAny(t, ['선박', 'lng', 'lpg', '수주잔고', '조선', '선가'])) signals.add('shipbuilding_cycle');
  if (includesAny(t, ['항공', '여객', '노선', '화물', '운임'])) signals.add('air_travel');
  if (includesAny(t, ['면세', '호텔', '관광', '여행'])) signals.add('travel_recovery');
  if (includesAny(t, ['전기차', '배터리', '리튬', '양극재', '음극재', '전해질'])) signals.add('battery_chain');
  if (includesAny(t, ['원전', '원자로', 'smr', '원자력'])) signals.add('nuclear');
  if (includesAny(t, ['수주', '수출']) && theme === '건설') signals.add('plant_order');

  return [...signals];
}

function describeSignalImpact(signal, stock) {
  if (signal === 'obesity_drug') {
    return '비만·당뇨 치료제는 전 세계에서 가장 큰 제약 시장 중 하나라서, 관련 계약이나 개발 진전만으로도 회사의 장기 매출 상상치를 크게 끌어올릴 수 있습니다.';
  }
  if (signal === 'oral_formulation') {
    return '주사제가 아니라 먹는 형태라는 점은 복용 편의성 때문에 시장 저변을 더 넓힐 수 있다는 기대를 만들고, 그래서 같은 약물 계열 안에서도 더 높은 관심을 받기 쉽습니다.';
  }
  if (signal === 'exclusive_license') {
    return '독점 판권이나 라이선스는 단순 판매 계약보다 강합니다. 특정 지역에서 먼저 시장을 가져갈 수 있다는 뜻으로 읽히기 때문에 수익성 기대를 키우는 재료가 됩니다.';
  }
  if (signal === 'tech_transfer') {
    return '기술이전과 로열티는 일회성 뉴스보다 무게가 큽니다. 성공하면 계약금, 마일스톤, 장기 로열티까지 이어질 수 있어 사업 구조 자체를 바꿀 수 있기 때문입니다.';
  }
  if (signal === 'commercial_contract') {
    return '계약·공급·수주 뉴스는 기대감만이 아니라 실제 매출 인식 가능성을 열어준다는 점에서 중요합니다. 후속 출하와 매출 확인만 붙으면 주가 해석이 더 강해질 수 있습니다.';
  }
  if (signal === 'regulatory_step') {
    return '허가나 임상 단계 진전은 파이프라인의 성공 확률이 한 단계 올라갔다는 신호로 받아들여지기 때문에, 바이오·헬스케어 종목에서는 주가 재평가 명분이 되기 쉽습니다.';
  }
  if (signal === 'earnings_turn') {
    return '실적과 흑자 전환 뉴스는 스토리주가 아니라 숫자로 검증되는 구간에 들어섰다는 뜻이라서, 시장이 밸류에이션을 다시 붙이는 계기가 될 수 있습니다.';
  }
  if (signal === 'commercial_launch') {
    return '출시·출하·양산은 기대 단계가 실제 판매 단계로 넘어간다는 뜻입니다. 시장은 이 시점부터 말보다 숫자를 보기 시작하므로 재평가 강도가 커질 수 있습니다.';
  }
  if (signal === 'ai_memory') {
    return 'HBM과 AI 메모리 키워드는 지금 글로벌 반도체 업황에서 가장 강한 프리미엄이 붙는 영역입니다. 고객사 공급이 확인되면 단순 업황 회복이 아니라 구조적 성장으로 해석됩니다.';
  }
  if (signal === 'datacenter_demand') {
    return '데이터센터와 서버 수요는 단기 이벤트보다 길게 가는 투자 사이클을 만들 수 있어, 관련 종목에는 멀티플 확장 논리까지 붙기 쉽습니다.';
  }
  if (signal === 'defense_export') {
    return '방산 수출은 계약 규모 자체도 크지만, 한 번 레퍼런스가 생기면 추가 국가로 확장될 가능성이 있어 단발성보다 장기 수주 잔고 관점에서 평가받습니다.';
  }
  if (signal === 'shipbuilding_cycle') {
    return '조선은 수주가 곧 몇 년치 매출 가시성으로 연결됩니다. 특히 LNG선 같은 고부가 선종이면 선가와 수익성까지 함께 좋아질 수 있다는 점이 중요합니다.';
  }
  if (signal === 'air_travel') {
    return '항공 뉴스는 단순 여객 회복을 넘어서 운임과 탑승률, 화물 단가 개선으로 이어질 수 있어 실적 민감도가 큽니다.';
  }
  if (signal === 'travel_recovery') {
    return '여행·면세·호텔 관련 뉴스는 소비 회복과 외국인 유입 확대를 의미할 수 있어, 업황 바닥 통과 기대를 키우는 재료가 됩니다.';
  }
  if (signal === 'battery_chain') {
    return '배터리 밸류체인은 전기차 침투율과 증설 속도에 따라 실적 레버리지가 크게 달라집니다. 공급 계약이나 신사업 진전은 업황 반등 기대를 키울 수 있습니다.';
  }
  if (signal === 'nuclear') {
    return '원전과 SMR 키워드는 정책과 대형 프로젝트가 맞물리는 영역이라 수주 공백을 메울 장기 성장 동력으로 해석될 수 있습니다.';
  }
  if (signal === 'plant_order') {
    return '플랜트·엔지니어링 수주는 매출 규모뿐 아니라 몇 년치 일감과 수익성 가시성을 동시에 보여준다는 점에서 건설주에는 강한 재료입니다.';
  }
  return `${stock.name} 관련 이슈가 실제 사업가치로 이어지는지 판단하는 데 중요한 뉴스입니다.`;
}

function buildHeadlineImpactNarrative(stock, item, theme) {
  const signals = extractHeadlineSignals(item.title, theme);
  if (!signals.length) {
    const tag = item.tag || '';
    if (tag === '실적') return '이 뉴스는 기대보다 숫자가 실제로 찍히는지 확인하는 재료라서, 시장이 밸류에이션을 다시 붙일 때 핵심 근거가 됩니다.';
    if (tag === '허가') return '이 뉴스는 허가와 일정 진전이 기업가치에 직접 연결되는 단계라서, 다음 주가 레벨을 결정하는 체크포인트가 될 수 있습니다.';
    if (tag === '계약' || tag === '공급' || tag === '주문') return '이 뉴스는 단순 기대감보다 실제 매출 인식 가능성이 있는 재료로 읽히기 때문에, 후속 공시가 붙으면 반응이 커질 수 있습니다.';
    if (tag === '기술이전' || tag === '로열티') return '이 뉴스는 단발성 기사보다 장기 수익 구조 변화로 이어질 수 있다는 점에서 의미가 큽니다.';
    return `${stock.name}에 대한 시장 기대가 실제 사업가치로 연결되는지 판단하는 재료입니다.`;
  }

  return signals
    .slice(0, 2)
    .map((signal) => describeSignalImpact(signal, stock))
    .join(' ');
}

function buildPositiveNarrative(stock, newsContext, theme) {
  return newsContext.top
    .slice(0, 3)
    .flatMap((item) => [
      `${summarizeDate(item.date)} '${item.title}'`,
      `-> 이 뉴스는 ${buildHeadlineImpactNarrative(stock, item, theme)}`,
      ''
    ]);
}

function buildWhyNewsMatters(stock, newsContext, theme) {
  const top = newsContext.top[0];
  if (!top) {
    return `지금 핵심은 기사 수가 아니라, ${stock.name}의 다음 기업 고유 공시나 실적이 실제로 나오는지입니다.`;
  }

  const narrative = buildHeadlineImpactNarrative(stock, top, theme);
  return `이 뉴스가 중요한 이유는 ${narrative}`;
}

function buildNextEvent(stock, newsContext) {
  if (newsContext.tags.includes('실적')) {
    return `시장에서는 다음 분기 실적에서 ${stock.name}의 최근 뉴스가 일회성이 아니라는 점이 다시 확인되는지를 볼 가능성이 높습니다.`;
  }
  if (newsContext.tags.includes('허가') || newsContext.tags.includes('임상')) {
    return `다음 체크포인트는 ${stock.name} 관련 허가·임상 진행 상황이 추가 공시나 후속 뉴스로 구체화되는지입니다.`;
  }
  if (newsContext.tags.includes('계약') || newsContext.tags.includes('공급') || newsContext.tags.includes('주문')) {
    return `다음 체크포인트는 계약·주문이 실제 매출 인식과 출하로 이어지는지, 그리고 후속 공시가 붙는지입니다.`;
  }
  return `지금은 ${stock.name}에 대해 시장이 강하게 붙을 다음 기업 고유 뉴스가 나오는지 지켜보는 구간에 가깝습니다.`;
}

function buildBreakCondition(stock, newsContext) {
  if (newsContext.grade === 'A') {
    return `반대로 기대가 꺾이는 조건은 최근 뉴스의 후속 공시가 없거나, 이미 나온 재료가 실제 숫자로 이어지지 않는 경우입니다.`;
  }
  if (newsContext.grade === 'B') {
    return `지금 단계에서 기대가 꺾이는 조건은 추가 확인 뉴스 없이 시간만 지나거나, 기존 뉴스가 기업가치와 직접 연결되지 않는 것으로 드러나는 경우입니다.`;
  }
  return `지금은 신규 호재 공백이 길어질수록 ${stock.name}에 대한 관심이 약해질 수 있고, 결국 실적이나 공시 같은 더 단단한 근거가 나올 때까지 기다려야 합니다.`;
}

function buildNewsAwareFiveQaSummary(stock, ctx, newsContext) {
  const { signal, favor, theme, tomorrowProb } = ctx;
  const valuation = favor >= 80 ? "기대가 꽤 반영된 구간" : favor >= 60 ? "적정~중립 구간" : "아직 기대가 덜 붙은 구간";
  const topNews = newsContext.top;
  const recentNewsLines = topNews.length
    ? topNews.map((item) => `${summarizeDate(item.date)} '${item.title}'`)
    : [];

  const whyMatters = buildWhyNewsMatters(stock, newsContext, theme);
  const nextEvent = buildNextEvent(stock, newsContext);
  const breakCondition = buildBreakCondition(stock, newsContext);
  const positiveNarrative = buildPositiveNarrative(stock, newsContext, theme);

  const section2 = [];
  if (newsContext.grade === 'A') {
    section2.push(
      `지금 ${stock.name}이 오를 수 있는 가장 현실적인 이유는 최근 기업 고유 뉴스가 단순한 주가 자극이 아니라, 시장이 크게 반응할 만한 사업 확장 스토리로 읽히기 때문입니다.`,
      `최근 핵심 뉴스는`,
      ...recentNewsLines,
      `입니다.`,
      "",
      ...positiveNarrative,
      whyMatters,
      `${signal} 신호와 내일 상승확률 ${tomorrowProb}%는 이런 뉴스 해석이 단기 수급 명분까지 만들 수 있다는 점을 보여줍니다.`,
      nextEvent,
      breakCondition
    );
  } else if (newsContext.grade === 'B' && newsContext.tone !== 'negative') {
    section2.push(
      `최근 ${stock.name} 관련 뉴스는 아예 비어 있지는 않지만, 지금 당장 주가를 강하게 재평가할 결정타라고 보기엔 아직 한 단계 부족합니다.`,
      `확인된 핵심 뉴스는`,
      ...recentNewsLines,
      `정도로 압축할 수 있습니다.`,
      "",
      ...positiveNarrative,
      whyMatters,
      `다만 현재 신호는 ${signal}, AI 점수는 ${favor}점이라 완전 약세보다는 뉴스 한두 건이 더 붙을 때 반응이 나올 수 있는 중간 구간에 가깝습니다.`,
      nextEvent,
      breakCondition
    );
  } else {
    section2.push(`솔직히 말하면 지금 ${stock.name}에 대해 주가를 강하게 밀어 올릴 만한 신규 핵심 호재는 뚜렷하지 않습니다.`);
    if (newsContext.top.length) {
      section2.push(
        `오히려 최근 수집된 기사에는`,
        ...recentNewsLines,
        `처럼 논란성·검증성·제한적 재료가 섞여 있어, 이를 곧바로 강한 호재로 해석하긴 어렵습니다.`
      );
    } else {
      section2.push(`최근 수집된 기사들 중 상당수는 시황성·주가 해설성 내용이거나, 기업가치를 바로 바꾼다고 보기 어려운 수준이었습니다.`);
    }
    section2.push(
      `그래서 현재 ${signal} 신호와 AI 점수 ${favor}점은 뉴스 폭발보다는 기존 기대와 수급이 버티는지 보는 구간으로 해석하는 편이 맞습니다.`,
      nextEvent,
      `당장 뚜렷한 새 호재가 안 보이는 만큼, 지금은 무리하게 의미를 부여하기보다 다음 실적·공시·계약 뉴스가 나올 때까지 기다리는 접근이 더 자연스럽습니다.`,
      breakCondition
    );
  }

  return [
    buildCompanyIntro(stock, theme),
    "",
    "📈 왜 오를 수 있나",
    ...section2,
    "",
    "⚠️ 뭐가 위험한가",
    `가장 큰 리스크는 최근 뉴스가 시장 기대를 키웠더라도, 후속 공시나 숫자로 이어지지 않으면 주가가 빠르게 원위치될 수 있다는 점입니다.`,
    `특히 ${stock.name}처럼 뉴스 민감도가 높은 종목은 같은 재료라도 거래대금이 약해지면 반응이 둔해지고 변동성만 커질 수 있습니다.`,
    `즉 좋은 기사 제목이 붙었다는 사실보다, 그 키워드가 실제 매출·이익·허가·수주로 이어지는지 확인되지 않으면 해석이 쉽게 뒤집힐 수 있습니다.`,
    "",
    "💰 지금 가격이 싼가 비싼가",
    `현재 가격은 절대 저평가 단정보다 ${valuation}으로 보는 편이 현실적입니다.`,
    `이미 알려진 뉴스가 어느 정도 반영됐을 가능성도 있고, 반대로 그 뉴스가 실제 숫자로 이어지면 지금 가격도 나중엔 비싸지 않았다고 평가될 수 있습니다.`,
    `그래서 지금은 싸다/비싸다보다, 최근 뉴스가 다음 분기 실적이나 공시로 검증될 수 있는 자리인지가 더 중요합니다.`,
    "",
    "🤔 그래서 지금 사도 되나",
    newsContext.grade === 'A'
      ? `최근 핵심 뉴스의 강도는 나쁘지 않지만, 그래도 추격보다 후속 확인을 보면서 분할 접근하는 쪽이 더 맞습니다.`
      : newsContext.grade === 'B'
        ? `지금은 강한 확신 매수보다, 다음 기업 고유 뉴스가 붙는지 확인하면서 대응하는 편이 더 자연스럽습니다.`
        : `지금은 섣불리 확신을 실을 자리가 아니라, 다음 기업 고유 호재가 실제로 나오는지 기다리는 구간에 가깝습니다.`,
    `단기라면 뉴스 공백 구간 추격매수보다 눌림과 거래대금 확인이 우선이고, 중기라면 다음 실적·공시를 확인한 뒤 비중을 나누는 접근이 더 안정적입니다.`,
    `정리하면 ${stock.name}은 ${newsContext.grade === 'A' ? '최근 뉴스 강도가 실제로 확인되는 편' : newsContext.grade === 'B' ? '관심은 둘 수 있지만 결정적 근거가 더 필요한 편' : '지금 당장 새 호재보다 검증이 먼저인 편'}입니다.`
  ].join("\n");
}

function buildAnalysis(stock) {
  const seed = hashCode(`${stock.code}:${stock.name}`);
  const price = Number(stock.close_price || 0);
  const priceFactor = price > 0 ? clamp(Math.round(Math.log10(price) * 12), 10, 30) : 12;

  // 실제 시장 데이터로 점수 보정
  const changeRate = Number(stock.change_rate || 0);       // 실제 등락률
  const volume     = Number(stock.volume || 0);             // 실제 거래량
  const prevPrice  = Number(stock.prev_price || price);
  const highPrice  = Number(stock.high_price || price);
  const lowPrice   = Number(stock.low_price  || price);

  // 등락률 기반 모멘텀 보정 (-15~+15점)
  const momentumBonus = clamp(Math.round(changeRate * 1.5), -15, 15);
  // 거래량 기반 수급 보정: 거래량 있으면 +0~+10점
  const volumeBonus = volume > 0 ? clamp(Math.round(Math.log10(volume + 1) * 1.5), 0, 10) : 0;
  // 변동폭(고저 차이) 기반 변동성 (좁을수록 안정적, +0~+5점)
  const rangeRatio = price > 0 ? (highPrice - lowPrice) / price : 0;
  const stabilityBonus = clamp(Math.round((0.1 - rangeRatio) * 50), -5, 5);

  const news = Math.round(seededRange(seed + 1, 45, 88));
  const earnings = Math.round(seededRange(seed + 2, 42, 92));
  const flow = clamp(Math.round(seededRange(seed + 3, 38, 90) + volumeBonus), 35, 95);
  const industry = Math.round(seededRange(seed + 4, 44, 91));
  const sentiment = clamp(Math.round(seededRange(seed + 5, 40, 86) + priceFactor / 4 + momentumBonus + stabilityBonus), 35, 95);

  const favor = Math.round(news * 0.2 + earnings * 0.25 + flow * 0.2 + industry * 0.2 + sentiment * 0.15);
  const signal = getSignal(favor);
  const signalEmoji = getSignalEmoji(signal);
  const triggerCount = clamp(Math.round(seededRange(seed + 6, 2, 6) + favor / 40), 2, 6);
  const tomorrowProb = clamp(Math.round(35 + favor * 0.52 + seededRange(seed + 7, -4, 8)), 40, 89);
  const prob1m = clamp(Math.round(30 + favor * 0.58 + seededRange(seed + 8, -6, 8)), 35, 91);
  const prob3m = clamp(Math.round(prob1m + seededRange(seed + 9, 4, 11)), 42, 94);
  const prob1y = clamp(Math.round(prob3m + seededRange(seed + 10, 4, 10)), 48, 96);
  const confidence = clamp(Math.round(45 + favor * 0.5), 45, 95);
  const theme = detectTheme(stock);
  const newsItems = newsMap[stock.code] || [];
  const newsContext = buildNewsContext(stock, newsItems);
  const newsGradeWeight = newsContext.grade === 'A' ? 14 : newsContext.grade === 'B' ? 5 : -18;
  const negativeTonePenalty = newsContext.tone === 'negative' ? -10 : newsContext.tone === 'mixed' ? -4 : 0;
  const rankScore = favor + newsGradeWeight + negativeTonePenalty;

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

  const bullPoints = newsContext.top.length
    ? newsContext.top.slice(0, 3).map((item) => ({
        type: 'news',
        icon: '📰',
        text: `${summarizeDate(item.date)} ${item.title}`,
        title: item.title,
        link: item.link || '',
        date: summarizeDate(item.date)
      }))
    : [
        `📰 최근 기업 고유 뉴스 강도는 ${newsContext.grade} 등급으로 분류됩니다.`,
        `⏳ 지금 당장 강한 신규 호재보다 다음 실적·공시 대기 구간입니다.`,
        `🚀 내일 상승 확률 ${tomorrowProb}% · ${signalEmoji} ${signal}`
      ];

  const riskPoints = [
    `⚠️ 최근 뉴스가 후속 공시·실적으로 이어지지 않으면 기대가 빠르게 꺾일 수 있습니다.`,
    `⚠️ 기사 제목 대비 실제 기업가치 변화가 약하면 되돌림이 커질 수 있습니다.`,
    `⚠️ 거래대금 둔화 시 뉴스 효과가 약해질 수 있습니다.`
  ];

  const future = newsContext.grade === 'A'
    ? '최근 핵심 뉴스가 후속 공시와 실적으로 이어지면 중기 재평가 가능성이 있습니다.'
    : newsContext.grade === 'B'
      ? '추가 기업 고유 뉴스가 붙는지 확인한 뒤 접근하는 편이 유효합니다.'
      : '지금은 뉴스 공백 구간에 가까워 다음 실적·공시 전까지 보수적 해석이 맞습니다.';

  const risk = newsContext.grade === 'A'
    ? '최근 뉴스 기대가 실제 숫자로 이어지지 않으면 조정 압력이 커질 수 있습니다.'
    : newsContext.grade === 'B'
      ? '재료의 질이 아직 완전히 검증되지 않아 추가 확인이 필요합니다.'
      : '신규 핵심 호재 부재 구간으로 관심 약화와 거래대금 둔화 리스크가 있습니다.';

  const flowText = newsContext.grade === 'A'
    ? '최근 뉴스가 유지되면 수급 재유입 명분이 생길 수 있습니다.'
    : newsContext.grade === 'B'
      ? '뉴스는 있으나 아직 수급을 강하게 한쪽으로 모을 정도의 명확성은 제한적입니다.'
      : '현재는 뉴스보다 수급 버팀 여부를 먼저 봐야 하는 구간입니다.';

  const summary = buildNewsAwareFiveQaSummary(stock, {
    signal,
    favor,
    theme,
    tomorrowProb
  }, newsContext);
  const preservedAiSummary = existingAiSummaryMap.get(stock.code);
  const existingFinancial = existingFinancialMap.get(stock.code) || {};

  return {
    code: stock.code,
    summary: preservedAiSummary || summary,
    summary_source: preservedAiSummary ? 'ai' : `news_grade_${newsContext.grade}`,
    favor_score: favor,
    rank_score: rankScore,
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
    foreign_flow: flowText,
    financial_metrics: existingFinancial.financial_metrics || null,
    financial_summary: existingFinancial.financial_summary || '',
    financial_source: existingFinancial.financial_source || '',
    financial_updated_at: existingFinancial.financial_updated_at || null
  };
}

const opts = parseArgs();
const newsMap = fs.existsSync(NEWS_MAP_PATH)
  ? (JSON.parse(fs.readFileSync(NEWS_MAP_PATH, 'utf8')).map || {})
  : {};
const existingAiSummaryMap = opts.resetAiSummaries
  ? new Map()
  : new Map(
    db.prepare("SELECT code, summary FROM stock_analysis WHERE summary_source = 'ai' AND summary IS NOT NULL").all()
      .map((row) => [String(row.code || ''), String(row.summary || '').trim()])
      .filter(([code, summary]) => code && summary)
  );
const existingFinancialMap = new Map(
  db.prepare("SELECT code, financial_metrics, financial_summary, financial_source, financial_updated_at FROM stock_analysis WHERE financial_metrics IS NOT NULL OR financial_summary IS NOT NULL").all()
    .map((row) => {
      const code = String(row.code || '').trim();
      if (!code) return null;
      let financialMetrics = null;
      try {
        financialMetrics = row.financial_metrics ? JSON.parse(row.financial_metrics) : null;
      } catch {
        financialMetrics = null;
      }
      return [code, {
        financial_metrics: financialMetrics,
        financial_summary: String(row.financial_summary || '').trim(),
        financial_source: String(row.financial_source || '').trim(),
        financial_updated_at: row.financial_updated_at || null
      }];
    })
    .filter(Boolean)
);

const stocks = db
  .prepare("SELECT code, name, market, close_price, prev_price, change_rate, volume, high_price, low_price, logo_url FROM stock_master WHERE market IN ('KOSPI','KOSDAQ') ORDER BY code")
  .all();

const now = new Date().toISOString();
const upsertAnalysis = db.prepare(`
INSERT INTO stock_analysis (code, summary, favor_score, signal, signal_emoji, trigger_count, tomorrow_prob, prob_1m, prob_3m, prob_1y, confidence, theme, bull_points, risk_points, signal_flags, future_outlook, risk, foreign_flow, summary_source, updated_at)
VALUES (@code,@summary,@favor_score,@signal,@signal_emoji,@trigger_count,@tomorrow_prob,@prob_1m,@prob_3m,@prob_1y,@confidence,@theme,@bull_points,@risk_points,@signal_flags,@future_outlook,@risk,@foreign_flow,@summary_source,@updated_at)
ON CONFLICT(code) DO UPDATE SET
  summary=excluded.summary,
  favor_score=excluded.favor_score,
  signal=excluded.signal,
  signal_emoji=excluded.signal_emoji,
  trigger_count=excluded.trigger_count,
  tomorrow_prob=excluded.tomorrow_prob,
  prob_1m=excluded.prob_1m,
  prob_3m=excluded.prob_3m,
  prob_1y=excluded.prob_1y,
  confidence=excluded.confidence,
  theme=excluded.theme,
  bull_points=excluded.bull_points,
  risk_points=excluded.risk_points,
  signal_flags=excluded.signal_flags,
  future_outlook=excluded.future_outlook,
  risk=excluded.risk,
  foreign_flow=excluded.foreign_flow,
  summary_source=excluded.summary_source,
  updated_at=excluded.updated_at
`);

const analyses = stocks
  .map(buildAnalysis)
  .filter((row) => !isHardExcludedCode(row.code));
const txAnalysis = db.transaction((rows) => {
  for (const row of rows) {
    upsertAnalysis.run({
      code:          row.code,
      summary:       row.summary,
      favor_score:   row.favor_score,
      signal:        row.signal,
      signal_emoji:  row.signal_emoji,
      trigger_count: row.trigger_count,
      tomorrow_prob: row.tomorrow_prob,
      prob_1m:       row.prob_1m,
      prob_3m:       row.prob_3m,
      prob_1y:       row.prob_1y,
      confidence:    row.confidence,
      theme:         row.theme,
      bull_points:   row.bull_points,
      risk_points:   row.risk_points,
      signal_flags:  JSON.stringify(row.signal_flags || []),
      future_outlook: row.future_outlook,
      risk:          row.risk,
      foreign_flow:  row.foreign_flow,
      summary_source: row.summary_source,
      updated_at:    now
    });
  }
});

txAnalysis(analyses);

const ordered = [...analyses].sort((a, b) => b.rank_score - a.rank_score || b.favor_score - a.favor_score || String(a.code).localeCompare(String(b.code)));

db.prepare('DELETE FROM stock_ranking').run();
const insertRank = db.prepare('INSERT INTO stock_ranking (code, favor_score, rank, updated_at) VALUES (?,?,?,?)');
const txRank = db.transaction((rows) => {
  rows.forEach((row, i) => insertRank.run(row.code, row.rank_score, i + 1, now));
});
txRank(ordered);

const stockMap = new Map(stocks.map((s) => [s.code, s]));
const analysisMapLocal = new Map(analyses.map((a) => [a.code, a]));
const exposureHistory = loadExposureHistory();
const todayDateKey = getKstDateKey();
const previousDateKey = getPreviousKstDateKey(todayDateKey);

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
const themePriorityBonus = new Map(
  themeRanking.map((item, index) => [item.theme, Math.max(0, 12 - (index * 3))])
);

const top = ordered.slice(0, 50).map((a, i) => {
  const s = stockMap.get(a.code) || {};
  return {
    code: a.code,
    favor_score: a.favor_score,
    rank_score: a.rank_score,
    rank: i + 1,
    name: s.name || a.code,
    market: s.market || '-',
    close_price: s.close_price ?? null,
    change_rate: s.change_rate ?? null,
    volume: s.volume ?? null,
    prev_price: s.prev_price ?? null,
    high_price: s.high_price ?? null,
    low_price: s.low_price ?? null,
    logo_url: s.logo_url || null,
    signal: a.signal,
    signal_emoji: a.signal_emoji,
    tomorrow_prob: a.tomorrow_prob,
    trigger_count: a.trigger_count,
    theme: a.theme
  };
});

const getRecentExcludedCodes = (listKey, days = 7) => getExposureCodesForRecentDays(exposureHistory, listKey, todayDateKey, days, true);
const getIntradaySignalExcludedCodes = () => {
  if (opts.mode !== 'intraday') return new Set();
  return getExposureCodes(exposureHistory, 'signal', todayDateKey);
};

function getTodayThemeScore(item) {
  const themeBonus = Number(themePriorityBonus.get(item.theme) || 0);
  return (
    Number(item.rank_score || 0) * 1.25 +
    Number(item.favor_score || 0) * 0.45 +
    Number(item.tomorrow_prob || 0) * 0.18 +
    Number(item.trigger_count || 0) * 1.8 +
    themeBonus
  );
}

function getIntradaySignalScore(item) {
  const signalWeight = item.signal === '상승 가능' ? 3 : item.signal === '중립' ? 2 : 1;
  const changeRate = Number(item.change_rate || 0);
  const volume = Number(item.volume || 0);
  const price = Number(item.close_price || 0);
  const highPrice = Number(item.high_price || price);
  const lowPrice = Number(item.low_price || price);
  const rangeRatio = price > 0 ? (highPrice - lowPrice) / price : 0;
  const volumeScore = volume > 0 ? clamp(Math.round(Math.log10(volume + 1) * 4), 0, 24) : 0;
  const momentumScore = clamp(Math.round(changeRate * 3.2), -12, 24);
  const rangeScore = clamp(Math.round(rangeRatio * 120), 0, 12);
  const themeScore = Number(themePriorityBonus.get(item.theme) || 0);
  return (
    Number(item.trigger_count || 0) * 10 +
    signalWeight * 12 +
    Number(item.confidence || 0) * 0.45 +
    Number(item.favor_score || 0) * 0.3 +
    Number(item.tomorrow_prob || 0) * 0.2 +
    volumeScore +
    momentumScore +
    rangeScore +
    themeScore
  );
}

const recent = ordered.slice(0, 100).map((a) => {
  const s = stockMap.get(a.code) || {};
  return {
    code: a.code,
    name: s.name || a.code,
    summary: a.summary,
    favor_score: a.favor_score,
    rank_score: a.rank_score,
    signal: a.signal,
    signal_emoji: a.signal_emoji,
    trigger_count: a.trigger_count,
    confidence: a.confidence,
    close_price: s.close_price ?? null,
    change_rate: s.change_rate ?? null,
    volume: s.volume ?? null,
    prev_price: s.prev_price ?? null,
    high_price: s.high_price ?? null,
    low_price: s.low_price ?? null,
    logo_url: s.logo_url || null,
    theme: a.theme,
    tomorrow_prob: a.tomorrow_prob,
    prob_1m: a.prob_1m,
    prob_3m: a.prob_3m,
    prob_1y: a.prob_1y,
    updated_at: now
  };
});

const fallbackSignalPool = ordered.slice(0, 240).map((a) => {
  const s = stockMap.get(a.code) || {};
  return {
    code: a.code,
    name: s.name || a.code,
    summary: a.summary,
    favor_score: a.favor_score,
    rank_score: a.rank_score,
    signal: a.signal,
    signal_emoji: a.signal_emoji,
    trigger_count: a.trigger_count,
    confidence: a.confidence,
    close_price: s.close_price ?? null,
    change_rate: s.change_rate ?? null,
    volume: s.volume ?? null,
    prev_price: s.prev_price ?? null,
    high_price: s.high_price ?? null,
    low_price: s.low_price ?? null,
    logo_url: s.logo_url || null,
    theme: a.theme,
    tomorrow_prob: a.tomorrow_prob,
    prob_1m: a.prob_1m,
    prob_3m: a.prob_3m,
    prob_1y: a.prob_1y,
    updated_at: now
  };
});

const todayCandidates = uniqueByCode(
  [...top].sort((a, b) =>
    getTodayThemeScore(b) - getTodayThemeScore(a) ||
    Number(b.rank_score || 0) - Number(a.rank_score || 0) ||
    Number(b.favor_score || 0) - Number(a.favor_score || 0) ||
    Number(b.tomorrow_prob || 0) - Number(a.tomorrow_prob || 0)
  )
);
const topThemesForToday = themeRanking
  .map((item) => item.theme)
  .filter((theme) => theme && theme !== '기타')
  .slice(0, 3);
const todaySelected = [];
const todaySelectedCodes = new Set();
const todayExcludedCodes = getRecentExcludedCodes('today', 7);
for (const theme of topThemesForToday.slice(0, 2)) {
  const match = pickFirstFreshByTheme(todayCandidates, theme, todayExcludedCodes, todaySelectedCodes);
  if (!match) continue;
  todaySelected.push(match);
  todaySelectedCodes.add(String(match.code));
}
for (const item of selectFreshItems(todayCandidates, 5, todayExcludedCodes)) {
  const code = String(item.code || '');
  if (!code || todaySelectedCodes.has(code)) continue;
  todaySelected.push(item);
  todaySelectedCodes.add(code);
  if (todaySelected.length >= 5) break;
}
const todayFresh = todaySelected.slice(0, 5);
const todayHome = fillRemainingItemsIfNeeded(todayFresh, todayCandidates, 5);

const tomorrowCandidates = uniqueByCode(
  [...recent].sort((a, b) =>
    Number(b.tomorrow_prob || 0) - Number(a.tomorrow_prob || 0) ||
    Number(b.prob_1m || 0) - Number(a.prob_1m || 0) ||
    Number(b.favor_score || 0) - Number(a.favor_score || 0) ||
    Number(themePriorityBonus.get(b.theme) || 0) - Number(themePriorityBonus.get(a.theme) || 0)
  )
);
const tomorrowExcludedCodes = new Set([
  ...getRecentExcludedCodes('tomorrow', 7),
  ...todayHome.map((item) => String(item?.code || '')).filter(Boolean)
]);
const tomorrowFresh = selectFreshItems(tomorrowCandidates, 10, tomorrowExcludedCodes);
const tomorrowHome = fillRemainingItemsIfNeeded(
  tomorrowFresh,
  tomorrowCandidates,
  10,
  new Set(todayHome.map((item) => String(item?.code || '')).filter(Boolean))
);

const signalCandidates = uniqueByCode(
  [...recent]
    .filter((item) =>
      Number(item.trigger_count || 0) >= 4 &&
      Number(item.favor_score || 0) >= 60 &&
      (item.signal === '상승 가능' || Number(item.change_rate || 0) >= 3)
    )
    .sort((a, b) =>
      getIntradaySignalScore(b) - getIntradaySignalScore(a) ||
      Number(b.trigger_count || 0) - Number(a.trigger_count || 0) ||
      Number(b.confidence || 0) - Number(a.confidence || 0) ||
      Number(b.favor_score || 0) - Number(a.favor_score || 0)
    )
);
const relaxedSignalCandidates = uniqueByCode(
  [...fallbackSignalPool]
    .filter((item) =>
      Number(item.trigger_count || 0) >= 3 ||
      Number(item.favor_score || 0) >= 55 ||
      item.signal === '상승 가능' ||
      Number(item.change_rate || 0) >= 2
    )
    .sort((a, b) =>
      getIntradaySignalScore(b) - getIntradaySignalScore(a) ||
      Number(b.trigger_count || 0) - Number(a.trigger_count || 0) ||
      Number(b.confidence || 0) - Number(a.confidence || 0) ||
      Number(b.favor_score || 0) - Number(a.favor_score || 0)
    )
);
const signalExcludedCodes = new Set([
  ...getRecentExcludedCodes('signal', 2),
  ...getIntradaySignalExcludedCodes(),
  ...todayHome.map((item) => String(item?.code || '')).filter(Boolean),
  ...tomorrowHome.map((item) => String(item?.code || '')).filter(Boolean)
]);
const signalSelected = selectFreshItems(signalCandidates, 5, signalExcludedCodes);
const signalSelectedCodes = new Set(signalSelected.map((item) => String(item?.code || '')).filter(Boolean));
for (const item of selectFreshItems(relaxedSignalCandidates, 5, signalExcludedCodes)) {
  const code = String(item?.code || '');
  if (!code || signalSelectedCodes.has(code)) continue;
  signalSelected.push(item);
  signalSelectedCodes.add(code);
  if (signalSelected.length >= 5) break;
}
const signalHome = fillRemainingItemsIfNeeded(
  signalSelected.slice(0, 5),
  relaxedSignalCandidates,
  5,
  new Set([
    ...todayHome.map((item) => String(item?.code || '')).filter(Boolean),
    ...tomorrowHome.map((item) => String(item?.code || '')).filter(Boolean)
  ])
);

const analysisMap = Object.fromEntries(
  analyses.map((a) => {
    const s = stockMap.get(a.code) || {};
    return [
      a.code,
      {
        code: a.code,
        summary: a.summary,
        favor_score: a.favor_score,
        rank_score: a.rank_score,
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
        summary_source: a.summary_source,
        financial_metrics: a.financial_metrics || null,
        financial_summary: a.financial_summary || '',
        financial_source: a.financial_source || '',
        financial_updated_at: a.financial_updated_at || null,
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

fs.writeFileSync(path.join(OUT_DIR, 'ui_top_stocks.json'), JSON.stringify({ generated_at: now, top }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_recent_analysis.json'), JSON.stringify({ generated_at: now, items: recent }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_analysis_map.json'), JSON.stringify({ generated_at: now, map: analysisMap }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_autocomplete.json'), JSON.stringify({ generated_at: now, items: autocomplete }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'ui_theme_ranking.json'), JSON.stringify({ generated_at: now, items: themeRanking }, null, 2));
fs.writeFileSync(HOME_TODAY_PATH, JSON.stringify({ generated_at: now, mode: opts.mode, items: todayHome }, null, 2));
fs.writeFileSync(HOME_SIGNAL_PATH, JSON.stringify({ generated_at: now, mode: opts.mode, items: signalHome }, null, 2));
if (opts.mode === 'full' || !fs.existsSync(HOME_TOMORROW_PATH)) {
  fs.writeFileSync(HOME_TOMORROW_PATH, JSON.stringify({ generated_at: now, mode: opts.mode, items: tomorrowHome }, null, 2));
}
mergeExposureCodes(exposureHistory, 'today', todayDateKey, todayHome);
mergeExposureCodes(exposureHistory, 'signal', todayDateKey, signalHome);
if (opts.mode === 'full' || !fs.existsSync(HOME_TOMORROW_PATH)) {
  mergeExposureCodes(exposureHistory, 'tomorrow', todayDateKey, tomorrowHome);
}
exposureHistory.generated_at = now;
pruneExposureHistory(exposureHistory);
writeJsonFile(HOME_EXPOSURE_HISTORY_PATH, exposureHistory);

console.log(`[cache] mode=${opts.mode} stocks=${stocks.length}, top=${top.length}, recent=${recent.length}, analysis_map=${Object.keys(analysisMap).length}, themes=${themeRanking.length}`);
console.log(`[cache] files written to ${OUT_DIR}`);

db.close();
