import { spawn } from "node:child_process";

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
  console.log("[morning-0830] step1: full news refresh and analysis cache rebuild");
  await runNode("scripts/daily-full-refresh.mjs");

  console.log("[morning-0830] step2: searched-stock news/detail enrichment");
  await runNode("scripts/refresh-searched-stocks.mjs", ["--window=am"]);

  console.log("[morning-0830] done");
}

main().catch((err) => {
  console.error("[morning-0830] failed:", err?.message || err);
  process.exitCode = 1;
});
