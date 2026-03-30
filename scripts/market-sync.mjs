import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fetchPopularSearchCodes } from "./search-targets.mjs";
import { loadDisplayedStockCodes } from "./news-targets.mjs";

const FULL_RUN_STATE_PATH = new URL("../data/market-sync-full-run-state.json", import.meta.url);

function nowInKstParts() {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const get = (type) => f.find((x) => x.type === type)?.value || "";
  const weekday = get("weekday");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    weekday,
    hour,
    minute,
    kstDate: `${year}-${month}-${day}`
  };
}

function isMarketOpenKst() {
  const { weekday, hour, minute } = nowInKstParts();
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  if (!isWeekday) return false;

  const hm = hour * 100 + minute;
  return hm >= 900 && hm <= 1530;
}

function isWeekendKst() {
  const { weekday } = nowInKstParts();
  return weekday === "Sat" || weekday === "Sun";
}

async function readFullRunState() {
  try {
    const raw = await readFile(FULL_RUN_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function markFullRunComplete(kstDate, mode) {
  await writeFile(
    FULL_RUN_STATE_PATH,
    JSON.stringify({ lastSuccessfulKstDate: kstDate, mode, updatedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf8"
  );
}

async function shouldRunNow() {
  const { kstDate, weekday, hour, minute } = nowInKstParts();

  if (isMarketOpenKst()) {
    return { run: true, mode: "intraday", kstDate };
  }

  const state = await readFullRunState();
  const hasFullRunToday = state?.lastSuccessfulKstDate === kstDate;
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const afterClose = hour > 15 || (hour === 15 && minute >= 30);

  if (isWeekday && afterClose) {
    if (hasFullRunToday) {
      return { run: false, reason: `after-close full sync already completed (${kstDate} KST)`, kstDate };
    }
    return { run: true, mode: "after-close-full", kstDate };
  }

  if (isWeekendKst()) {
    if (hasFullRunToday) {
      return { run: false, reason: `weekend full sync already completed (${kstDate} KST)`, kstDate };
    }
    return { run: true, mode: "weekend-daily", kstDate };
  }

  return { run: false, reason: "out of market hours (KST)", kstDate };
}

function runNode(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn("node", [scriptPath, ...args], { stdio: "inherit" });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} ${args.join(" ")} exit=${code}`));
    });
  });
}

async function main() {
  const runDecision = await shouldRunNow();
  if (!runDecision.run) {
    console.log(`[market-sync] skipped: ${runDecision.reason}`);
    return;
  }

  console.log(`[market-sync] mode=${runDecision.mode} kstDate=${runDecision.kstDate}`);

  if (runDecision.mode === "weekend-daily" || runDecision.mode === "after-close-full") {
    console.log(`[market-sync] ${runDecision.mode}: full news + full analysis cache rebuild`);
    await runNode("scripts/daily-full-refresh.mjs", ["--reset-ai-summaries"]);
    await markFullRunComplete(runDecision.kstDate, runDecision.mode);
    console.log("[market-sync] done");
    return;
  }

  console.log("[market-sync] step1: prices sync");
  await runNode("scripts/build-stock-master.mjs");

  console.log("[market-sync] step2: naver finance popular build");
  await runNode("scripts/build-naver-popular.mjs");

  console.log("[market-sync] step3: latest visible-stock news cache build");
  const searchedCodes = await fetchPopularSearchCodes({ limit: 30, days: 3 });
  const displayedCodes = loadDisplayedStockCodes({ includeExposureHistoryDays: 7 });
  const newsArgs = ["--mode=top", "--limit=120"];
  const extraCodes = [...new Set([...searchedCodes, ...displayedCodes])];
  if (extraCodes.length) {
    newsArgs.push(`--codes=${extraCodes.join(",")}`);
    console.log(`[market-sync] extra news targets searched=${searchedCodes.length} displayed=${displayedCodes.length} unique=${extraCodes.length}`);
  }
  await runNode("scripts/build-news-cache.mjs", newsArgs);

  console.log("[market-sync] step4: analysis/ranking cache build");
  await runNode("scripts/build-ui-cache.mjs", ["--mode=intraday"]);

  console.log("[market-sync] step5: stock pages regenerate");
  await runNode("scripts/generate-stock-pages.mjs");

  console.log("[market-sync] step6: pages dist sync");
  await runNode("scripts/sync-pages-dist.mjs");

  console.log("[market-sync] step7: pages deploy");
  await runNode("scripts/deploy-pages.mjs");

  console.log("[market-sync] done");
}

main().catch((err) => {
  console.error("[market-sync] failed:", err?.message || err);
  process.exitCode = 1;
});
