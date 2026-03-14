const DEFAULT_SEARCH_TARGETS_URL = "https://luckystock.pages.dev/api/searches/top";

export async function fetchPopularSearchCodes({ limit = 20, days = 7 } = {}) {
  const baseUrl = String(process.env.SEARCH_TARGETS_URL || DEFAULT_SEARCH_TARGETS_URL).trim();
  if (!baseUrl) return [];

  const url = new URL(baseUrl);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("days", String(days));

  try {
    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "LuckyStock-SearchTargets/1.0" }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.items)
      ? data.items.map((item) => String(item?.code || "")).filter((code) => /^\d{6}$/.test(code))
      : [];
  } catch {
    return [];
  }
}
