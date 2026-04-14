import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve("/home/user/luckstock");
const DIST_DIR = path.join(ROOT_DIR, ".pages-dist");
const EXCLUDED_DATA_FILE_PATTERNS = [
  /\.db(?:-.+)?$/i,
  /\.log$/i,
  /\.pid$/i,
  /\.heartbeat$/i,
  /\.trace$/i,
  /\.bak(?:\..*)?$/i,
  /\.nohup\.log$/i
];

const COPY_TARGETS = [
  "data",
  "stock",
  "theme",
  "seminar",
  "ppt",
  "ppt-assets",
  "sitemap.xml",
  "index.html",
  "main.js",
  "style.css",
  "about.html",
  "contact.html",
  "privacy.html",
  "robots.txt",
  "favicon.png",
  "favicon-app.png",
  "apple-touch-icon.png",
  "og-image.png",
  "llms.txt"
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function shouldCopy(target, sourcePath) {
  if (target !== "data") return true;

  const relativeSource = path.relative(path.join(ROOT_DIR, "data"), sourcePath);
  if (!relativeSource) return true;

  const baseName = path.basename(relativeSource);
  return !EXCLUDED_DATA_FILE_PATTERNS.some((pattern) => pattern.test(baseName));
}

function syncTarget(relativePath) {
  const sourcePath = path.join(ROOT_DIR, relativePath);
  const distPath = path.join(DIST_DIR, relativePath);

  if (!fs.existsSync(sourcePath)) return;

  ensureDir(path.dirname(distPath));
  fs.cpSync(sourcePath, distPath, {
    recursive: true,
    force: true,
    filter: (source) => shouldCopy(relativePath, source)
  });
  console.log(`[pages-dist] synced ${relativePath}`);
}

function syncPagesFunctions() {
  const sourcePath = path.join(ROOT_DIR, "pages-functions");
  const distPath = path.join(DIST_DIR, "functions");
  if (!fs.existsSync(sourcePath)) return;

  ensureDir(path.dirname(distPath));
  fs.cpSync(sourcePath, distPath, { recursive: true, force: true });
  console.log("[pages-dist] synced functions");
}

function main() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  ensureDir(DIST_DIR);
  for (const target of COPY_TARGETS) syncTarget(target);
  syncPagesFunctions();
  console.log("[pages-dist] sync complete");
}

main();
