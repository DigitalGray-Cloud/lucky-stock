function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getVisitorApiBase(env = {}) {
  return String(
    env.VISITOR_API_BASE_URL
      || env.LUCKYSTOCK_API_BASE_URL
      || env.API_BASE_URL
      || ""
  ).trim().replace(/\/+$/, "");
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const apiBase = getVisitorApiBase(env);

  if (!apiBase) {
    return json(
      { error: "visitor_api_base_not_configured", unique_visitors: 0, total_hits: 0 },
      { status: 503 }
    );
  }

  const upstreamUrl = new URL("/api/visitors/today", `${apiBase}/`);
  const incomingUrl = new URL(request.url);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers();
  headers.set("accept", "application/json");

  const forwardedHeaders = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "user-agent"];
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers
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
      {
        error: "visitor_proxy_failed",
        message: String(error?.message || error),
        unique_visitors: 0,
        total_hits: 0
      },
      { status: 502 }
    );
  }
}
