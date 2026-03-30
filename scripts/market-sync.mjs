import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fetchPopularSearchCodes } from "./search-targets.mjs";

const WEEKEND_RUN_STATE_PATH = new URL("../data/market-sync-weekend-state.json", import.meta.url);

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

async function readWeekendRunState() {
  try {
    const raw = await readFile(WEEKEND_RUN_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function markWeekendRunComplete(kstDate) {
  await writeFile(
    WEEKEND_RUN_STATE_PATH,
    JSON.stringify({ lastSuccessfulKstDate: kstDate, updatedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf8"
  );
}

async function shouldRunNow() {
  const { kstDate } = nowInKstParts();

  if (isMarketOpenKst()) {
    return { run: true, mode: "intraday", kstDate };
  }

  if (!isWeekendKst()) {
    return { run: false, reason: "out of market hours (KST)", kstDate };
  }

  const state = await readWeekendRunState();
  if (state?.lastSuccessfulKstDate === kstDate) {
    return { run: false, reason: `weekend daily sync already completed (${kstDate} KST)`, kstDate };
  }

  return { run: true, mode: "weekend-daily", kstDate };
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
  console.log("[market-sync] step1: prices sync");
  await runNode("scripts/build-stock-master.mjs");

  console.log("[market-sync] step2: latest top-stock news cache build");
  const searchedCodes = await fetchPopularSearchCodes({ limit: 30, days: 3 });
  const newsArgs = ["--mode=top", "--limit=120"];
  if (searchedCodes.length) {
    newsArgs.push(`--codes=${searchedCodes.join(",")}`);
    console.log(`[market-sync] searched-stock news targets=${searchedCodes.length}`);
  }
  await runNode("scripts/build-news-cache.mjs", newsArgs);

  console.log("[market-sync] step3: naver finance popular build");
  await runNode("scripts/build-naver-popular.mjs");

  console.log("[market-sync] step4: analysis/ranking cache build");
  await runNode("scripts/build-ui-cache.mjs", ["--mode=intraday"]);

  console.log("[market-sync] step5: stock pages regenerate");
  await runNode("scripts/generate-stock-pages.mjs");

  console.log("[market-sync] step6: pages dist sync");
  await runNode("scripts/sync-pages-dist.mjs");

  console.log("[market-sync] step7: pages deploy");
  await runNode("scripts/deploy-pages.mjs");

  if (runDecision.mode === "weekend-daily") {
    await markWeekendRunComplete(runDecision.kstDate);
  }

  console.log("[market-sync] done");
}

main().catch((err) => {
  console.error("[market-sync] failed:", err?.message || err);
  process.exitCode = 1;
});
