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

function runBatch() {
  return new Promise((resolve, reject) => {
    const p = spawn("node", ["scripts/build-stock-master.mjs"], {
      stdio: "inherit"
    });

    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build-stock-master exit=${code}`));
    });
  });
}

async function main() {
  if (!isMarketOpenKst()) {
    console.log("[market-sync] skipped: out of market hours (KST)");
    return;
  }

  console.log("[market-sync] running build-stock-master (KST market hours)");
  await runBatch();
  console.log("[market-sync] done");
}

main().catch((err) => {
  console.error("[market-sync] failed:", err?.message || err);
  process.exitCode = 1;
});
