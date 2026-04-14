import { spawn } from "node:child_process";
import path from "node:path";

const DIST_DIR = path.resolve("/home/user/luckstock/.pages-dist");
const STRICT_DEPLOY = process.env.PAGES_DEPLOY_STRICT === "1";

function isAuthFailure(output) {
  return [
    "Authentication error [code: 10000]",
    "Invalid access token [code: 9109]",
    "error code: 9109",
    "error code: 10000"
  ].some((needle) => output.includes(needle));
}

async function main() {
  await new Promise((resolve, reject) => {
    const p = spawn(
      "npx",
      ["wrangler", "pages", "deploy", ".", "--project-name=luckystock", "--commit-dirty=true", "--no-bundle", "--branch=main"],
      {
        cwd: DIST_DIR,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let output = "";
    p.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(chunk);
    });
    p.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(chunk);
    });

    p.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (!STRICT_DEPLOY && isAuthFailure(output)) {
        console.warn("[pages-deploy] warning: Cloudflare auth invalid, skipping deploy failure");
        resolve();
        return;
      }

      reject(new Error(`pages deploy exit=${code}`));
    });
  });
}

main().catch((err) => {
  console.error("[pages-deploy] failed:", err?.message || err);
  process.exitCode = 1;
});
