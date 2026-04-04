import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const ROOT = "/home/user/luckstock";
const OUT_DIR = path.join(ROOT, "ppt-assets");
const WIDTH = 1600;
const HEIGHT = 900;

const assets = [
  {
    file: "company-logo.png",
    kind: "logo",
    accent: "#1d4ed8",
    accentSoft: "rgba(29,78,216,0.14)",
    title: "COMPANY",
    subtitle: "Replace with your official logo if available"
  },
  {
    file: "setup-firebase.png",
    kind: "setup",
    kicker: "Environment",
    title: "Firebase 웹 기반 작업 환경",
    subtitle: "초기 구성을 빠르게 잡고, 인증 · 데이터 · 실험 단계를 가볍게 시작하는 흐름",
    accent: "#ff7b39",
    accentSoft: "rgba(255,123,57,0.18)",
    chips: ["Hosting", "Auth", "Realtime", "Rapid Setup"],
    bullets: ["빠른 초기 구성과 검증", "웹 중심 실험에 적합", "연결 구조를 빠르게 시각화"],
    icon: "firebase"
  },
  {
    file: "setup-cloudflare.png",
    kind: "setup",
    kicker: "Deploy",
    title: "Cloudflare Pages 배포 흐름",
    subtitle: "정적 페이지 배포, 빠른 반영, 간단한 운영 루프를 한 장으로 정리",
    accent: "#2f6bff",
    accentSoft: "rgba(47,107,255,0.16)",
    chips: ["Pages", "Static", "Fast Publish", "Edge"],
    bullets: ["배포 속도와 운영 단순성 확보", "정적 리소스 배포에 최적화", "설명하기 쉬운 구조"],
    icon: "cloud"
  },
  {
    file: "setup-github.png",
    kind: "setup",
    kicker: "Source Control",
    title: "GitHub 중심 작업 이력 관리",
    subtitle: "커밋, 변경 추적, 협업 근거를 남기는 흐름을 카드형으로 시각화",
    accent: "#111827",
    accentSoft: "rgba(17,24,39,0.14)",
    chips: ["Commit", "History", "Review", "Backup"],
    bullets: ["변경 이력과 복구 근거 확보", "설명 가능한 작업 흐름 유지", "배포 전 점검 기준 정리"],
    icon: "github"
  },
  {
    file: "setup-cli-ai.png",
    kind: "setup",
    kicker: "AI Workflow",
    title: "CLI 환경에서 AI 병행 작업",
    subtitle: "Gemini CLI, Claude, OpenAI를 역할에 따라 분담하는 작업 흐름",
    accent: "#6d38ff",
    accentSoft: "rgba(109,56,255,0.16)",
    chips: ["Gemini CLI", "Claude", "OpenAI", "Prompt Loop"],
    bullets: ["역할에 따라 모델 분담", "프롬프트 수정과 재시도 반복", "문제 정의가 품질로 연결"],
    icon: "terminal"
  },
  {
    file: "setup-analytics.png",
    kind: "setup",
    kicker: "Analytics",
    title: "운영 분석과 사용자 흐름 확인",
    subtitle: "Analytics와 Clarity를 통해 실제 서비스 관점의 개선 포인트를 추적",
    accent: "#06b6d4",
    accentSoft: "rgba(6,182,212,0.16)",
    chips: ["Analytics", "Clarity", "SEO/GEO", "Share"],
    bullets: ["유입과 행동 흐름 측정", "운영 이후 개선 포인트 추적", "배포 이후 분석까지 포함"],
    icon: "analytics"
  },
  {
    file: "project-workout-main.png",
    kind: "screen",
    accent: "#0f9d58",
    accentSoft: "rgba(15,157,88,0.16)",
    app: "AI Workout Master",
    label: "Main Screen",
    title: "운동 기록을 말로 남기는 첫 화면",
    lines: ["Voice Log", "Today Summary", "Recommended Workout", "Fatigue Notice"],
    chart: "bars"
  },
  {
    file: "project-workout-detail.png",
    kind: "screen",
    accent: "#14b8a6",
    accentSoft: "rgba(20,184,166,0.16)",
    app: "AI Workout Master",
    label: "Detail Screen",
    title: "기록, 통계, 피드백이 이어지는 상세 화면",
    lines: ["Workout History", "Progress Trend", "AI Feedback", "Next Session"],
    chart: "line"
  },
  {
    file: "project-stock-main.png",
    kind: "screen",
    accent: "#2563eb",
    accentSoft: "rgba(37,99,235,0.16)",
    app: "LuckyStock AI",
    label: "Main Screen",
    title: "오늘의 판단을 빠르게 보여주는 메인 화면",
    lines: ["BUY / HOLD / SELL", "Top Movers", "Signal Feed", "Ranked Analysis"],
    chart: "bars"
  },
  {
    file: "project-stock-detail.png",
    kind: "screen",
    accent: "#4f46e5",
    accentSoft: "rgba(79,70,229,0.16)",
    app: "LuckyStock AI",
    label: "Detail Screen",
    title: "뉴스와 점수 근거가 이어지는 상세 분석 화면",
    lines: ["Reason Summary", "Score Breakdown", "Recent News", "Risk Signal"],
    chart: "line"
  },
  {
    file: "pros-visual.png",
    kind: "concept",
    accent: "#2563eb",
    accentSoft: "rgba(37,99,235,0.16)",
    kicker: "Upside",
    title: "Execution accelerates when the barrier drops",
    subtitle: "아이디어가 생각에 머물지 않고, 더 빠르게 형태를 갖추는 장면",
    type: "up"
  },
  {
    file: "cons-visual.png",
    kind: "concept",
    accent: "#ef4444",
    accentSoft: "rgba(239,68,68,0.14)",
    kicker: "Caution",
    title: "Fast output still needs verification",
    subtitle: "검증, 운영 품질, 영향도 확인이 함께 따라와야 하는 장면",
    type: "risk"
  },
  {
    file: "ai-visual.png",
    kind: "concept",
    accent: "#7c3aed",
    accentSoft: "rgba(124,58,237,0.15)",
    kicker: "Comparison",
    title: "Different tools, different strengths",
    subtitle: "Claude · Gemini · OpenAI를 각기 다른 결로 배치한 비교 비주얼",
    type: "compare"
  }
];

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBase(ctx, accent, accentSoft) {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#f8fbff");
  bg.addColorStop(1, "#edf3fb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(240, 120, 30, 240, 120, 340);
  glow.addColorStop(0, accentSoft);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow2 = ctx.createRadialGradient(1380, 180, 30, 1380, 180, 280);
  glow2.addColorStop(0, "rgba(59,130,246,0.10)");
  glow2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  roundedRect(ctx, 48, 48, WIDTH - 96, HEIGHT - 96, 40);
  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.stroke();

  ctx.strokeStyle = "rgba(148,163,184,0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(90 + i * 210, 48);
    ctx.lineTo(20 + i * 190, HEIGHT - 48);
    ctx.stroke();
  }

  roundedRect(ctx, 92, 92, 180, 50, 24);
  ctx.fillStyle = accentSoft;
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = "700 22px sans-serif";
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawIcon(ctx, kind, x, y, accent) {
  roundedRect(ctx, x, y, 120, 120, 30);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.stroke();

  ctx.save();
  ctx.translate(x + 60, y + 60);
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  if (kind === "firebase") {
    ctx.beginPath();
    ctx.moveTo(-18, 28); ctx.lineTo(0, -36); ctx.lineTo(20, -6); ctx.lineTo(6, 32); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-30, 24); ctx.lineTo(-8, -18); ctx.lineTo(2, 0); ctx.lineTo(-12, 30); ctx.closePath(); ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  } else if (kind === "cloud") {
    ctx.beginPath();
    ctx.arc(-14, 6, 18, Math.PI * 0.9, Math.PI * 1.95);
    ctx.arc(10, -2, 22, Math.PI, Math.PI * 2);
    ctx.arc(28, 10, 16, Math.PI * 1.1, Math.PI * 1.95);
    ctx.lineTo(-28, 28); ctx.closePath(); ctx.fill();
  } else if (kind === "github") {
    ctx.beginPath(); ctx.arc(0, -4, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, -18); ctx.lineTo(-6, -34); ctx.lineTo(0, -18); ctx.lineTo(6, -34); ctx.lineTo(16, -18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, 22); ctx.quadraticCurveTo(0, 8, 16, 22); ctx.stroke();
  } else if (kind === "terminal") {
    roundedRect(ctx, -34, -24, 68, 50, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-4, 4); ctx.lineTo(-18, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 16); ctx.lineTo(18, 16); ctx.stroke();
  } else if (kind === "analytics") {
    ctx.fillRect(-24, 8, 14, 28); ctx.fillRect(-2, -6, 14, 42); ctx.fillRect(20, -24, 14, 60);
    ctx.beginPath(); ctx.moveTo(-28, -20); ctx.lineTo(-8, -2); ctx.lineTo(8, -14); ctx.lineTo(30, -32); ctx.stroke();
  }
  ctx.restore();
}

function drawChips(ctx, chips, x, y, accent, accentSoft) {
  ctx.font = "700 22px sans-serif";
  chips.forEach((chip, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const tx = x + col * 220;
    const ty = y + row * 64;
    const w = ctx.measureText(chip).width + 36;
    roundedRect(ctx, tx, ty, w, 48, 24);
    ctx.fillStyle = accentSoft; ctx.fill();
    ctx.fillStyle = accent; ctx.fillText(chip, tx + 18, ty + 31);
  });
}

function drawSetup(asset) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBase(ctx, asset.accent, asset.accentSoft);
  ctx.fillText(asset.kicker, 118, 124);
  drawIcon(ctx, asset.icon, 102, 180, asset.accent);
  ctx.fillStyle = "#0f172a"; ctx.font = "700 60px sans-serif"; ctx.fillText(asset.title, 102, 368);
  ctx.fillStyle = "#5b677a"; ctx.font = "400 30px sans-serif"; wrapText(ctx, asset.subtitle, 102, 430, 650, 42);
  drawChips(ctx, asset.chips, 102, 552, asset.accent, asset.accentSoft);
  ctx.fillStyle = asset.accent; ctx.font = "700 20px sans-serif"; ctx.fillText("Key Notes", 102, 742);
  asset.bullets.forEach((item, i) => {
    ctx.beginPath(); ctx.arc(108, 776 + i * 40, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#334155"; ctx.font = "500 24px sans-serif"; ctx.fillText(item, 126, 784 + i * 40); ctx.fillStyle = asset.accent;
  });

  drawDashboard(ctx, 874, 120, 620, 660, asset.accent, asset.accentSoft, asset.icon);
  save(canvas, asset.file);
}

function drawDashboard(ctx, x, y, w, h, accent, accentSoft, icon) {
  roundedRect(ctx, x, y, w, h, 34); ctx.fillStyle = "rgba(255,255,255,0.76)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,0.16)"; ctx.stroke();
  roundedRect(ctx, x + 34, y + 30, w - 68, 84, 22); ctx.fillStyle = accentSoft; ctx.fill();
  ctx.fillStyle = accent; ctx.font = "700 28px sans-serif"; ctx.fillText(icon.toUpperCase(), x + 58, y + 82);
  for (let i = 0; i < 3; i += 1) {
    const py = y + 148 + i * 156;
    roundedRect(ctx, x + 34, py, w - 68, 122, 24); ctx.fillStyle = i === 1 ? "rgba(255,255,255,0.98)" : "rgba(244,248,252,0.95)"; ctx.fill();
    ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.stroke();
    ctx.fillStyle = accent; ctx.globalAlpha = 0.14; ctx.fillRect(x + 58, py + 26, 160 + i * 70, 14); ctx.fillRect(x + 58, py + 54, 320, 10); ctx.fillRect(x + 58, py + 76, 250 + i * 40, 10); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x + w - 94, py + 60, 24, 0, Math.PI * 2); ctx.fillStyle = accentSoft; ctx.fill();
  }
  ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 62, y + 98); ctx.bezierCurveTo(x + 140, y + 48, x + 250, y + 170, x + 332, y + 132); ctx.bezierCurveTo(x + 410, y + 96, x + 500, y + 154, x + 560, y + 110); ctx.stroke();
}

function drawScreen(asset) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBase(ctx, asset.accent, asset.accentSoft);
  ctx.fillStyle = asset.accent; ctx.fillText(asset.label, 118, 124);
  ctx.fillStyle = "#0f172a"; ctx.font = "700 60px sans-serif"; ctx.fillText(asset.app, 100, 222);
  ctx.font = "700 42px sans-serif"; ctx.fillText(asset.title, 100, 298);
  roundedRect(ctx, 100, 352, 360, 320, 30); ctx.fillStyle = asset.accentSoft; ctx.fill();
  ctx.fillStyle = asset.accent; ctx.font = "700 22px sans-serif"; ctx.fillText("Core Signals", 130, 400);
  asset.lines.forEach((item, idx) => {
    roundedRect(ctx, 128, 430 + idx * 54, 304, 40, 18); ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.fill();
    ctx.fillStyle = idx === 0 ? asset.accent : "#334155"; ctx.font = "600 22px sans-serif"; ctx.fillText(item, 148, 456 + idx * 54);
  });
  ctx.fillStyle = "#64748b"; ctx.font = "500 28px sans-serif"; wrapText(ctx, "정보를 나열하기보다, 핵심 판단이 먼저 보이도록 구성한 화면 컨셉", 100, 730, 520, 40);

  drawBrowserShot(ctx, 700, 118, 760, 650, asset.accent, asset.chart);
  save(canvas, asset.file);
}

function drawBrowserShot(ctx, x, y, w, h, accent, chart) {
  roundedRect(ctx, x, y, w, h, 34); ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,0.18)"; ctx.stroke();
  roundedRect(ctx, x + 24, y + 22, w - 48, 52, 18); ctx.fillStyle = "rgba(248,250,252,0.96)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,0.14)"; ctx.stroke();
  ["#ef4444", "#f59e0b", "#22c55e"].forEach((c, i) => { ctx.beginPath(); ctx.fillStyle = c; ctx.arc(x + 48 + i * 22, y + 48, 6, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = "rgba(148,163,184,0.24)"; roundedRect(ctx, x + 120, y + 34, 300, 28, 14); ctx.fill();
  roundedRect(ctx, x + 30, y + 98, 220, h - 128, 26); ctx.fillStyle = "rgba(244,248,252,0.96)"; ctx.fill();
  roundedRect(ctx, x + 274, y + 98, w - 304, 180, 26); ctx.fillStyle = "rgba(240,247,255,0.96)"; ctx.fill();
  roundedRect(ctx, x + 274, y + 298, w - 304, h - 330, 26); ctx.fillStyle = "rgba(250,252,255,0.98)"; ctx.fill();
  for (let i = 0; i < 5; i += 1) { roundedRect(ctx, x + 52, y + 132 + i * 70, 174, 44, 16); ctx.fillStyle = i === 1 ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.9)"; ctx.fill(); }
  ctx.fillStyle = accent; ctx.globalAlpha = 0.16; ctx.fillRect(x + 304, y + 132, 220, 18); ctx.fillRect(x + 304, y + 164, 460, 12); ctx.fillRect(x + 304, y + 188, 340, 12); ctx.globalAlpha = 1;
  if (chart === "bars") {
    [56, 92, 128, 72, 146].forEach((bh, i) => { ctx.fillStyle = i === 4 ? accent : "rgba(37,99,235,0.18)"; roundedRect(ctx, x + 320 + i * 72, y + h - 110 - bh, 42, bh, 12); ctx.fill(); });
  } else {
    ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 320, y + h - 120); ctx.bezierCurveTo(x + 400, y + h - 220, x + 470, y + h - 80, x + 560, y + h - 140); ctx.bezierCurveTo(x + 620, y + h - 184, x + 690, y + h - 60, x + 760, y + h - 170); ctx.stroke();
    [0,1,2,3,4].forEach(i => { ctx.beginPath(); ctx.fillStyle = accent; ctx.arc(x + 320 + i * 110, y + h - 120 - [0,80,20,100,50][i], 7, 0, Math.PI * 2); ctx.fill(); });
  }
}

function drawConcept(asset) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBase(ctx, asset.accent, asset.accentSoft);
  ctx.fillStyle = asset.accent; ctx.fillText(asset.kicker, 118, 124);
  ctx.fillStyle = "#0f172a"; ctx.font = "700 64px sans-serif"; wrapText(ctx, asset.title, 100, 250, 650, 74);
  ctx.fillStyle = "#64748b"; ctx.font = "400 30px sans-serif"; wrapText(ctx, asset.subtitle, 100, 410, 620, 42);
  roundedRect(ctx, 100, 520, 520, 210, 30); ctx.fillStyle = asset.accentSoft; ctx.fill();
  const points = asset.type === "compare"
    ? ["Claude: 정교함", "Gemini: 안정감", "OpenAI: 범용성"]
    : asset.type === "risk"
      ? ["검증", "운영 기준", "영향도 확인"]
      : ["낮아진 진입 장벽", "빨라진 프로토타입", "넓어진 시도 범위"];
  ctx.fillStyle = asset.accent; ctx.font = "700 20px sans-serif"; ctx.fillText("Highlights", 132, 566);
  points.forEach((p, i) => {
    roundedRect(ctx, 128, 594 + i * 46, 462, 34, 17); ctx.fillStyle = "rgba(255,255,255,0.78)"; ctx.fill();
    ctx.fillStyle = "#334155"; ctx.font = "600 22px sans-serif"; ctx.fillText(p, 148, 618 + i * 46);
  });

  drawConceptGraphic(ctx, 820, 126, 610, 620, asset.accent, asset.type);
  save(canvas, asset.file);
}

function drawConceptGraphic(ctx, x, y, w, h, accent, type) {
  roundedRect(ctx, x, y, w, h, 36); ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,0.16)"; ctx.stroke();
  if (type === "up") {
    [90, 150, 230, 320].forEach((bh, i) => { ctx.fillStyle = i === 3 ? accent : "rgba(37,99,235,0.16)"; roundedRect(ctx, x + 90 + i * 96, y + h - 80 - bh, 56, bh, 18); ctx.fill(); });
    ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 90, y + h - 170); ctx.bezierCurveTo(x + 220, y + h - 330, x + 330, y + h - 160, x + 510, y + 150); ctx.stroke();
  } else if (type === "risk") {
    roundedRect(ctx, x + 110, y + 130, 390, 270, 28); ctx.fillStyle = "rgba(254,242,242,0.9)"; ctx.fill(); ctx.strokeStyle = "rgba(239,68,68,0.18)"; ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x + 305, y + 150); ctx.lineTo(x + 470, y + 380); ctx.lineTo(x + 140, y + 380); ctx.closePath(); ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = accent; ctx.fillRect(x + 296, y + 214, 18, 88); ctx.beginPath(); ctx.arc(x + 305, y + 336, 10, 0, Math.PI * 2); ctx.fill();
  } else {
    const cards = ["Claude", "Gemini", "OpenAI"];
    cards.forEach((name, i) => {
      const cx = x + 56 + i * 182;
      roundedRect(ctx, cx, y + 150, 154, 250, 28); ctx.fillStyle = i === 2 ? "rgba(124,58,237,0.14)" : "rgba(248,250,252,0.94)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,0.14)"; ctx.stroke();
      ctx.fillStyle = i === 2 ? accent : "#111827"; ctx.font = "700 28px sans-serif"; ctx.fillText(name, cx + 24, y + 212);
      ctx.fillStyle = "rgba(99,102,241,0.16)"; ctx.fillRect(cx + 24, y + 244, 100, 12); ctx.fillRect(cx + 24, y + 274, 86, 12); ctx.fillRect(cx + 24, y + 304, 110, 12);
    });
  }
}

function drawLogo(asset) {
  const canvas = createCanvas(900, 900);
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 900, 900);
  grad.addColorStop(0, "#eff6ff"); grad.addColorStop(1, "#dbeafe");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 900, 900);
  ctx.fillStyle = asset.accentSoft; ctx.beginPath(); ctx.arc(240, 230, 220, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(700, 260, 160, 0, Math.PI * 2); ctx.fill();
  roundedRect(ctx, 130, 130, 640, 640, 160); ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
  ctx.strokeStyle = asset.accent; ctx.lineWidth = 28; ctx.beginPath(); ctx.moveTo(280, 560); ctx.lineTo(430, 320); ctx.lineTo(620, 560); ctx.stroke();
  ctx.fillStyle = "#0f172a"; ctx.font = "700 88px sans-serif"; ctx.fillText("C", 400, 710);
  save(canvas, asset.file);
}

function save(canvas, file) {
  fs.writeFileSync(path.join(OUT_DIR, file), canvas.toBuffer("image/png"));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const asset of assets) {
  if (asset.kind === "logo") drawLogo(asset);
  else if (asset.kind === "setup") drawSetup(asset);
  else if (asset.kind === "screen") drawScreen(asset);
  else if (asset.kind === "concept") drawConcept(asset);
}
console.log(`generated ${assets.length} ppt assets in ${OUT_DIR}`);
