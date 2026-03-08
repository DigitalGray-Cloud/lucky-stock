import { config } from "./config.js";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSignal(score) {
  if (score >= 75) return "상승 가능";
  if (score >= 55) return "중립";
  return "주의";
}

function buildFiveQaSummary(stock, opts = {}) {
  const favor = Number(opts.favorScore || 60);
  const signal = opts.signal || normalizeSignal(favor);
  const valuation = favor >= 80 ? "밸류 부담이 큰 구간" : favor >= 60 ? "적정~중립 구간" : "할인 구간";

  return [
    "🏢 이 회사 뭐 하는 곳인가",
    `${stock.name}(${stock.code})은 ${stock.market || "국내 증시"}에 상장된 ${stock.sector || "핵심 산업"} 관련 종목입니다.`,
    "이 종목의 핵심은 단순 제품 설명보다, 실적과 수급을 동시에 움직이는 주력 사업의 경쟁력입니다.",
    "돈을 버는 구조는 주력 사업 매출과 마진 방어력에 달려 있으며, 업황이 살아날 때 이익 레버리지가 커지는 편입니다.",
    "시장에서는 테마성 단기 반응보다 실적 추세와 외국인·기관 수급의 지속성이 더 강하게 반영됩니다.",
    "결국 이 종목은 회사 소개보다 업황 회복 구간에서 숫자로 증명할 수 있는지가 주가의 핵심 축입니다.",
    "",
    "📈 왜 오를 수 있나",
    `첫째, 현재 AI 신호는 ${signal}이고 점수는 ${favor}점으로 완전 약세보다는 반등 논리가 살아 있는 구간입니다.`,
    "둘째, 실적은 확정 숫자보다 턴어라운드 기대가 먼저 형성될 때 주가가 선행하는 경우가 많습니다.",
    "셋째, 외국인·기관 수급이 한 방향으로 정리되기 시작하면 대형주든 중소형주든 탄력이 빨라질 수 있습니다.",
    "넷째, 업황 회복 기대와 뉴스 모멘텀이 겹치면 밸류에이션 재평가가 단기간에 진행되기도 합니다.",
    "즉 상승 논리는 분명하며, 핵심은 기대가 실제 실적 확인으로 이어지는지입니다.",
    "",
    "⚠️ 뭐가 위험한가",
    "겉으로 좋아 보여도 가장 큰 리스크는 기대가 먼저 앞서고 실적이 뒤따르지 못하는 경우입니다.",
    "업황 반등이 지연되면 좋은 스토리도 밸류 부담으로 전환되며 매물이 빠르게 나올 수 있습니다.",
    "수급이 약해지는 구간에서는 같은 호재라도 주가 반응이 둔해지고 변동성만 확대될 수 있습니다.",
    "테마 과열 구간에서는 회사가 나빠서가 아니라 기대치가 높아 조정이 강하게 나타날 수 있습니다.",
    "좋은 회사라는 사실과 좋은 매수 타이밍은 다를 수 있다는 점이 핵심 리스크입니다.",
    "",
    "💰 지금 가격이 싼가 비싼가",
    `현재 점수 기준으로 보면 절대 저평가라고 단정하기보다는 ${valuation}에 가깝습니다.`,
    "많이 올라 보이는 자리라도 실적 개선 속도가 더 빠르면 비싸 보이는 가격이 정당화될 수 있습니다.",
    "반대로 싸 보이는 자리라도 시장이 할인하는 이유가 구조적이면 주가가 오래 눌릴 수 있습니다.",
    "그래서 숫자는 단순 PER/PBR 레벨보다, 앞으로 2~3분기 이익 추정치가 상향되는지가 더 중요합니다.",
    "결국 지금 자리는 가격 자체보다 기대가 얼마나 선반영됐는지 점검해야 하는 구간입니다.",
    "",
    "🤔 그래서 지금 사도 되나",
    "지금은 한 번에 크게 진입하기보다 분할 접근으로 리스크를 관리하는 구간입니다.",
    "단기 관점이라면 추격매수보다 눌림에서 거래량이 재유입되는지 확인하고 대응하는 편이 유리합니다.",
    "중기 관점이라면 실적 발표와 가이던스에서 기대를 확인해가며 비중을 늘리는 전략이 현실적입니다.",
    "신호가 살아 있어도 변동성은 항상 열려 있으므로 손절·비중 규칙을 먼저 정하고 접근하셔야 합니다.",
    "지금 구간은 포기할 자리가 아니라, 확신을 숫자로 확인하며 진입 타이밍을 나눠 가져갈 자리입니다."
  ].join("\n");
}

export function buildFallbackAnalysis(stock) {
  const favor = 60;
  const signal = normalizeSignal(favor);
  return {
    summary: buildFiveQaSummary(stock, { favorScore: favor, signal }),
    favorScore: favor,
    signal,
    bullPoints: ["산업 내 지위 유지", "유동성 양호", "중장기 관찰 가치"],
    futureOutlook: "실적 발표와 업황 사이클에 따라 탄력적으로 재평가될 가능성이 큽니다.",
    risk: "시장 변동성과 업종 리스크가 확대될 경우 단기 변동 폭이 커질 수 있습니다.",
    foreignFlow: "최근 외국인/기관 수급은 종목별 차별화가 강해 추세 확인이 필요합니다."
  };
}

export async function generateStockAnalysis(stock) {
  if (!config.openAiApiKey) {
    return { ...buildFallbackAnalysis(stock), source: "fallback:no_api_key" };
  }

  const system = [
    "너는 LuckyStock의 핵심 종목 분석 AI다.",
    "절대 기계적인 문장으로 쓰지 말고, 현실적인 투자 판단 문체로 작성한다.",
    "모든 문장은 존댓말로 작성하고, 반말 표현은 절대 사용하지 않는다.",
    "좋은 점과 리스크를 균형 있게 쓰고, 없는 사실은 절대 지어내지 않는다.",
    "summary는 반드시 아래 5개 섹션 제목 순서를 정확히 지킨다:",
    "🏢 이 회사 뭐 하는 곳인가",
    "📈 왜 오를 수 있나",
    "⚠️ 뭐가 위험한가",
    "💰 지금 가격이 싼가 비싼가",
    "🤔 그래서 지금 사도 되나",
    "각 섹션은 최소 5줄 이상, 최대 10줄 이내로 쓴다.",
    "섹션 간 논리가 연결된 하나의 투자 스토리여야 하며, BUY/HOLD/SELL만 반복하지 않는다.",
    "summary는 줄바꿈(\\n)을 포함한 일반 문자열로 반환한다.",
    "Return JSON only with keys: summary,favorScore,signal,bullPoints,futureOutlook,risk,foreignFlow.",
    "favorScore must be integer between 0 and 100.",
    "signal must be one of: 상승 가능, 중립, 주의.",
    "bullPoints must be array with exactly 3 short strings in Korean."
  ].join(" ");

  const user = [
    "다음 입력 데이터로 summary를 작성해줘. 없는 데이터는 '확인 필요'처럼 정직하게 표현해.",
    `- 종목명: ${stock.name}`,
    `- 종목코드: ${stock.code}`,
    `- 시장: ${stock.market || "확인 필요"}`,
    `- 핵심 사업/섹터: ${stock.sector || "확인 필요"}`,
    "- 최근 주가 흐름: 확인 필요",
    "- 52주 고점/저점: 확인 필요",
    "- 실적/수급/거래량/뉴스/모멘텀/밸류: 확인 필요",
    "문체는 친절하지만 투자 서비스답게 논리적이어야 하고, 마지막 섹션은 실제 행동 가이드로 마무리해."
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!res.ok) {
    const fallback = buildFallbackAnalysis(stock);
    return { ...fallback, source: `fallback:openai_${res.status}` };
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    const fallback = buildFallbackAnalysis(stock);
    return { ...fallback, source: "fallback:invalid_json" };
  }

  const favorScore = Math.max(0, Math.min(100, Number(parsed.favorScore) || 0));
  const bullPointsRaw = Array.isArray(parsed.bullPoints) ? parsed.bullPoints : [];
  const bullPoints = bullPointsRaw.slice(0, 3).map((x) => String(x || "").trim()).filter(Boolean);

  return {
    summary: String(parsed.summary || "").trim() || buildFiveQaSummary(stock, { favorScore, signal: parsed.signal }),
    favorScore,
    signal: ["상승 가능", "중립", "주의"].includes(parsed.signal) ? parsed.signal : normalizeSignal(favorScore),
    bullPoints: bullPoints.length === 3 ? bullPoints : buildFallbackAnalysis(stock).bullPoints,
    futureOutlook: String(parsed.futureOutlook || "").trim() || buildFallbackAnalysis(stock).futureOutlook,
    risk: String(parsed.risk || "").trim() || buildFallbackAnalysis(stock).risk,
    foreignFlow: String(parsed.foreignFlow || "").trim() || buildFallbackAnalysis(stock).foreignFlow,
    source: "openai"
  };
}
