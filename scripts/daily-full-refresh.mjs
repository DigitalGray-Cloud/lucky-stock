import { spawn } from "node:child_process";

function parseArgs(argv = process.argv.slice(2)) {
  return {
    resetAiSummaries: argv.includes("--reset-ai-summaries")
  };
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
  const opts = parseArgs();

  console.log("[daily-full-refresh] step1: prices sync");
  await runNode("scripts/build-stock-master.mjs");

  console.log("[daily-full-refresh] step2: all-stock news cache build");
  await runNode("scripts/build-news-cache.mjs", ["--mode=all"]);

  console.log("[daily-full-refresh] step3: naver finance popular build");
  await runNode("scripts/build-naver-popular.mjs");

  console.log("[daily-full-refresh] step4: analysis/ranking cache build");
  const cacheArgs = ["--mode=full"];
  if (opts.resetAiSummaries) {
    cacheArgs.push("--reset-ai-summaries");
  }
  await runNode("scripts/build-ui-cache.mjs", cacheArgs);

  console.log("[daily-full-refresh] step5: stock pages regenerate");
  await runNode("scripts/generate-stock-pages.mjs");

  console.log("[daily-full-refresh] step6: pages dist sync");
  await runNode("scripts/sync-pages-dist.mjs");

  console.log("[daily-full-refresh] step7: pages deploy");
  await runNode("scripts/deploy-pages.mjs");

  console.log("[daily-full-refresh] done");
}

main().catch((err) => {
  console.error("[daily-full-refresh] failed:", err?.message || err);
  process.exitCode = 1;
});
