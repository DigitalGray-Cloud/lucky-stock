import { spawn } from "node:child_process";

function nowInKstParts() {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const get = (type) => f.find((x) => x.type === type)?.value || "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return { weekday, hour, minute };
}

function isMarketOpenKst() {
  const { weekday, hour, minute } = nowInKstParts();
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  if (!isWeekday) return false;

  const hm = hour * 100 + minute;
  return hm >= 900 && hm <= 1530;
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
  if (!isMarketOpenKst()) {
    console.log("[market-sync] skipped: out of market hours (KST)");
    return;
  }

  console.log("[market-sync] step1: prices sync");
  await runNode("scripts/build-stock-master.mjs");

  console.log("[market-sync] step2: latest top-stock news cache build");
  await runNode("scripts/build-news-cache.mjs", ["--mode=top", "--limit=120"]);

  console.log("[market-sync] step3: naver finance popular build");
  await runNode("scripts/build-naver-popular.mjs");

  console.log("[market-sync] step4: analysis/ranking cache build");
  await runNode("scripts/build-ui-cache.mjs");

  console.log("[market-sync] step5: stock pages regenerate");
  await runNode("scripts/generate-stock-pages.mjs");

  console.log("[market-sync] done");
}

main().catch((err) => {
  console.error("[market-sync] failed:", err?.message || err);
  process.exitCode = 1;
});
