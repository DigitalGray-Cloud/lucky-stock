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

async function fetchCounterApi(request) {
  const url = new URL(request.url);
  const track = url.searchParams.get("track") !== "0";
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateKey = kst.toISOString().slice(0, 10).replace(/-/g, "");
  const namespace = "luckystock";
  const key = `today-${dateKey}`;
  const method = track ? "up" : "get";

  const response = await fetch(
    `https://api.counterapi.dev/v1/${namespace}/${key}/${method}`,
    { headers: { "User-Agent": "LuckyStock-Visitor-Counter/1.0" } }
  );

  if (response.ok) {
    const data = await response.json();
    const count = Number(data?.count || 0);
    return json({ unique_visitors: count, total_hits: count, count, date: dateKey, ok: true });
  }

  if (track) {
    const fallback = await fetch(
      `https://api.counterapi.dev/v1/${namespace}/${key}/get`,
      { headers: { "User-Agent": "LuckyStock-Visitor-Counter/1.0" } }
    ).catch(() => null);
    if (fallback?.ok) {
      const data = await fallback.json();
      const count = Number(data?.count || 0);
      return json({ unique_visitors: count, total_hits: count, count, date: dateKey, ok: true });
    }
  }

  return json({ unique_visitors: 0, total_hits: 0, count: 0, date: dateKey, ok: false });
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
    return fetchCounterApi(request);
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
