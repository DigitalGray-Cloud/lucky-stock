import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const ROOT_DIR = path.resolve("/home/user/luckstock");
const SOURCE_ICON = path.join(ROOT_DIR, "favicon.png");
const OUTPUT_FAVICON = path.join(ROOT_DIR, "favicon-app.png");
const OUTPUT_APPLE = path.join(ROOT_DIR, "apple-touch-icon.png");

function isBackgroundPixel(r, g, b, a) {
  if (a < 8) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const neutral = max - min < 28;
  return neutral && min > 180;
}

function stripOuterBackground(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const seen = new Uint8Array(width * height);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (seen[idx]) return;
    const p = idx * 4;
    if (!isBackgroundPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) return;
    seen[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    const p = idx * 4;
    data[p + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  ctx.putImageData(image, 0, 0);
}

async function renderSymbolCanvas() {
  const src = await loadImage(SOURCE_ICON);
  const cropX = 20;
  const cropY = 8;
  const cropW = 215;
  const cropH = 186;

  const canvas = createCanvas(cropW, cropH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  stripOuterBackground(ctx, cropW, cropH);
  return canvas;
}

async function renderPaddedIcon({ size, background = null, radius = 0, insetRatio = 0.14 }) {
  const symbol = await renderSymbolCanvas();
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  if (background) {
    ctx.fillStyle = background;
    if (radius > 0) {
      const r = radius;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, size, size);
    }
  }

  const inset = Math.round(size * insetRatio);
  const targetW = size - inset * 2;
  const targetH = Math.round(targetW * (symbol.height / symbol.width));
  const offsetX = Math.round((size - targetW) / 2);
  const offsetY = Math.round((size - targetH) / 2);

  ctx.drawImage(symbol, 0, 0, symbol.width, symbol.height, offsetX, offsetY, targetW, targetH);
  return canvas.toBuffer("image/png");
}

async function main() {
  fs.writeFileSync(OUTPUT_FAVICON, await renderPaddedIcon({ size: 512, insetRatio: 0.12 }));
  fs.writeFileSync(
    OUTPUT_APPLE,
    await renderPaddedIcon({ size: 180, background: "#f8fbff", radius: 36, insetRatio: 0.16 })
  );
  console.log(`[favicon-assets] wrote ${path.basename(OUTPUT_FAVICON)}`);
  console.log(`[favicon-assets] wrote ${path.basename(OUTPUT_APPLE)}`);
}

main().catch((error) => {
  console.error("[favicon-assets] failed:", error);
  process.exitCode = 1;
});
