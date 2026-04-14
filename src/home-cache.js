import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const DATA_DIR = path.join(config.rootDir, "data");

function readJsonFile(filename, fallback) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

export function getHomeCachePayload() {
  const autocomplete = readJsonFile("ui_autocomplete.json", { items: [], generated_at: "" });
  const analysisMap = readJsonFile("ui_analysis_map.json", { map: {}, generated_at: "" });
  const top = readJsonFile("ui_top_stocks.json", { top: [], generated_at: "" });
  const recent = readJsonFile("ui_recent_analysis.json", { items: [], generated_at: "" });
  const themes = readJsonFile("ui_theme_ranking.json", { items: [], generated_at: "" });
  const newsMap = readJsonFile("ui_news_map.json", { map: {}, generated_at: "" });
  const naverPopular = readJsonFile("ui_naver_popular.json", { items: [], generated_at: "" });
  const homeToday = readJsonFile("ui_home_today.json", { items: [], generated_at: "" });
  const homeTomorrow = readJsonFile("ui_home_tomorrow.json", { items: [], generated_at: "" });
  const homeSignal = readJsonFile("ui_home_signal.json", { items: [], generated_at: "" });

  return {
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
  };
}
