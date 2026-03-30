import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("/home/user/luckstock");
const DATA_DIR = path.join(ROOT, "data");

const CODE_LIST_FILES = [
  "ui_top_stocks.json",
  "ui_recent_analysis.json",
  "ui_home_today.json",
  "ui_home_tomorrow.json",
  "ui_home_signal.json",
  "ui_naver_popular.json"
];

const EXPOSURE_HISTORY_PATH = path.join(DATA_DIR, "ui_home_exposure_history.json");

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function addCode(codeSet, value) {
  const code = String(value || "").trim();
  if (/^\d{6}$/.test(code)) {
    codeSet.add(code);
  }
}

function collectCodesFromValue(codeSet, value) {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCodesFromValue(codeSet, item);
    }
    return;
  }

  if (typeof value !== "object") return;

  if ("code" in value) {
    addCode(codeSet, value.code);
  }

  if ("items" in value) {
    collectCodesFromValue(codeSet, value.items);
  }

  if ("top" in value) {
    collectCodesFromValue(codeSet, value.top);
  }
}

function getRecentKstDateKeys(days = 7) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const keys = [];

  for (let i = 0; i < days; i += 1) {
    const dt = new Date(kst);
    dt.setUTCDate(dt.getUTCDate() - i);
    keys.push(dt.toISOString().slice(0, 10));
  }

  return keys;
}

function collectExposureHistoryCodes(codeSet, days = 7) {
  const history = readJsonFile(EXPOSURE_HISTORY_PATH, {});
  const daily = history?.daily;
  if (!daily || typeof daily !== "object") return;

  const keys = getRecentKstDateKeys(days);
  for (const listKey of ["today", "tomorrow", "signal"]) {
    const bucket = daily[listKey];
    if (!bucket || typeof bucket !== "object") continue;

    for (const dateKey of keys) {
      const codes = bucket[dateKey];
      if (!Array.isArray(codes)) continue;
      for (const code of codes) {
        addCode(codeSet, code);
      }
    }
  }
}

export function loadDisplayedStockCodes({ includeExposureHistoryDays = 7 } = {}) {
  const codes = new Set();

  for (const fileName of CODE_LIST_FILES) {
    const payload = readJsonFile(path.join(DATA_DIR, fileName), {});
    collectCodesFromValue(codes, payload);
  }

  if (includeExposureHistoryDays > 0) {
    collectExposureHistoryCodes(codes, includeExposureHistoryDays);
  }

  return [...codes];
}
