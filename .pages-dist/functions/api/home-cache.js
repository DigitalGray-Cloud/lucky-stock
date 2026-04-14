function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getApiBase(env = {}) {
  return String(
    env.LUCKYSTOCK_API_BASE_URL
      || env.API_BASE_URL
      || env.VISITOR_API_BASE_URL
      || ""
  ).trim().replace(/\/+$/, "");
}

async function loadJsonAsset(request, pathname, fallback) {
  try {
    const target = new URL(pathname, request.url);
    const response = await fetch(target.toString(), {
      headers: { "cache-control": "no-cache" }
    });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function fallbackFromStaticAssets(request) {
  const [autocomplete, analysisMap, top, recent, themes, newsMap, naverPopular, homeToday, homeTomorrow, homeSignal] = await Promise.all([
    loadJsonAsset(request, "/data/ui_autocomplete.json", { items: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_analysis_map.json", { map: {}, generated_at: "" }),
    loadJsonAsset(request, "/data/ui_top_stocks.json", { top: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_recent_analysis.json", { items: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_theme_ranking.json", { items: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_news_map.json", { map: {}, generated_at: "" }),
    loadJsonAsset(request, "/data/ui_naver_popular.json", { items: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_home_today.json", { items: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_home_tomorrow.json", { items: [], generated_at: "" }),
    loadJsonAsset(request, "/data/ui_home_signal.json", { items: [], generated_at: "" })
  ]);

  return json({
    generated_at: homeToday.generated_at || analysisMap.generated_at || "",
    autocomplete: Array.isArray(autocomplete.items) ? autocomplete.items : [],
    analysis_map: analysisMap.map || {},
    top: Array.isArray(top.top) ? top.top : [],
    recent: Array.isArray(recent.items) ? recent.items : [],
    themes: Array.isArray(themes.items) ? themes.items : [],
    news_map: newsMap.map || {},
    naver_popular: Array.isArray(naverPopular.items) ? naverPopular.items : [],
    home_today: Array.isArray(homeToday.items) ? homeToday.items : [],
    home_tomorrow: Array.isArray(homeTomorrow.items) ? homeTomorrow.items : [],
    home_signal: Array.isArray(homeSignal.items) ? homeSignal.items : []
  });
}

export async function onRequestGet(context) {
  const apiBase = getApiBase(context.env);
  if (!apiBase) {
    return fallbackFromStaticAssets(context.request);
  }

  const upstreamUrl = new URL("/api/home-cache", `${apiBase}/`);

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { accept: "application/json" }
    });
    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      }
    });
  } catch (error) {
    return json(
      { error: "home_cache_proxy_failed", message: String(error?.message || error) },
      { status: 502 }
    );
  }
}
