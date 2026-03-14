import { spawn } from "node:child_process";
import { fetchPopularSearchCodes } from "./search-targets.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { limit: 20, days: 7, aiLimit: 10, window: "am" };
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) opts.limit = Number(arg.split("=")[1] || 20) || 20;
    if (arg.startsWith("--days=")) opts.days = Number(arg.split("=")[1] || 7) || 7;
    if (arg.startsWith("--ai-limit=")) opts.aiLimit = Number(arg.split("=")[1] || 10) || 10;
    if (arg.startsWith("--window=")) opts.window = String(arg.split("=")[1] || "am");
  }
  return opts;
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
  const codes = await fetchPopularSearchCodes({ limit: opts.limit, days: opts.days });
  if (!codes.length) {
    console.log("[searched-refresh] no searched stocks found");
    return;
  }

  console.log(`[searched-refresh] target=${codes.length} window=${opts.window}`);
  await runNode("scripts/build-news-cache.mjs", [`--mode=all`, `--codes=${codes.join(",")}`]);

  if (process.env.ANTHROPIC_API_KEY) {
    for (const code of codes.slice(0, opts.aiLimit)) {
      await runNode("scripts/generate-ai-summaries.mjs", ["--force", "--code", code, "--concurrency", "1"]);
    }
  } else {
    console.log("[searched-refresh] ANTHROPIC_API_KEY not set, skipping detailed AI summary regeneration");
  }

  await runNode("scripts/build-ui-cache.mjs", ["--mode=full"]);
  await runNode("scripts/generate-stock-pages.mjs");
  console.log("[searched-refresh] done");
}

main().catch((err) => {
  console.error("[searched-refresh] failed:", err?.message || err);
  process.exitCode = 1;
});
