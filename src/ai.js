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

export function buildFallbackAnalysis(stock) {
  const favor = 60;
  return {
    summary: `${stock.name}(${stock.code})은 최근 데이터 기준으로 중립 이상의 흐름이 관측되며, 실적/수급 확인 후 접근이 필요합니다.`,
    favorScore: favor,
    signal: normalizeSignal(favor),
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
    "You are a Korean stock analyst assistant.",
    "Return JSON only with keys: summary,favorScore,signal,bullPoints,futureOutlook,risk,foreignFlow.",
    "favorScore must be integer between 0 and 100.",
    "signal must be one of: 상승 가능, 중립, 주의.",
    "bullPoints must be array with exactly 3 short strings in Korean."
  ].join(" ");

  const user = `종목코드 ${stock.code}, 종목명 ${stock.name}, 시장 ${stock.market}, 섹터 ${stock.sector || "미분류"} 기준으로 4~5줄 수준의 투자 참고 분석을 작성해줘.`;

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
    summary: String(parsed.summary || "").trim() || buildFallbackAnalysis(stock).summary,
    favorScore,
    signal: ["상승 가능", "중립", "주의"].includes(parsed.signal) ? parsed.signal : normalizeSignal(favorScore),
    bullPoints: bullPoints.length === 3 ? bullPoints : buildFallbackAnalysis(stock).bullPoints,
    futureOutlook: String(parsed.futureOutlook || "").trim() || buildFallbackAnalysis(stock).futureOutlook,
    risk: String(parsed.risk || "").trim() || buildFallbackAnalysis(stock).risk,
    foreignFlow: String(parsed.foreignFlow || "").trim() || buildFallbackAnalysis(stock).foreignFlow,
    source: "openai"
  };
}
