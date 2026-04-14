function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getApiBase(env = {}) {
  return String(
    env.LUCKYSTOCK_API_BASE_URL
      || env.API_BASE_URL
      || ""
  ).trim().replace(/\/+$/, "");
}

function validateName(name) {
  const value = String(name || "").trim();
  if (value.length > 24) return "이름은 24자 이하로 입력해 주세요.";
  return "";
}

function validateMessage(message) {
  const value = String(message || "").trim();
  if (!value) return "내용을 입력해 주세요.";
  if (value.length > 120) return "내용은 120자 이하로 입력해 주세요.";
  return "";
}

function validatePassword(password) {
  const value = String(password || "").trim();
  if (!value) return "비밀번호를 입력해 주세요.";
  if (value.length > 20) return "비밀번호는 20자 이하로 입력해 주세요.";
  return "";
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || "").trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function serializePost(row) {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    masterReply: row.master_reply || "",
    masterReplyAt: row.master_reply_at || ""
  };
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback_posts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  try { await db.prepare(`ALTER TABLE feedback_posts ADD COLUMN master_reply TEXT DEFAULT ''`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE feedback_posts ADD COLUMN master_reply_at TEXT DEFAULT ''`).run(); } catch {}
}

async function buildAnonymousName(db) {
  const rows = await db.prepare(`
    SELECT name
    FROM feedback_posts
    WHERE name LIKE '아무개%'
  `).all();
  const list = Array.isArray(rows?.results) ? rows.results : [];
  let maxNumber = 0;
  for (const row of list) {
    const match = String(row?.name || "").match(/^아무개(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value;
  }
  return `아무개${maxNumber + 1}`;
}

async function normalizeName(db, name) {
  const value = String(name || "").trim();
  if (value) return value;
  return buildAnonymousName(db);
}

async function handleD1Get(env) {
  const db = env.luckystock_visitors;
  if (!db) return null;
  await ensureTable(db);
  const rows = await db.prepare(`
    SELECT id, name, message, created_at, updated_at, master_reply, master_reply_at
    FROM feedback_posts
    ORDER BY created_at DESC, rowid DESC
  `).all();
  const items = (Array.isArray(rows?.results) ? rows.results : []).map(serializePost);
  return json({ items });
}

async function handleD1Post(context) {
  const db = context.env.luckystock_visitors;
  if (!db) return null;
  await ensureTable(db);

  const body = await context.request.json().catch(() => ({}));
  const { name, message, password } = body || {};
  const error = validateName(name) || validateMessage(message) || validatePassword(password);
  if (error) return json({ error: "invalid_input", message: error }, { status: 400 });

  const timestamp = new Date().toISOString();
  const normalizedName = await normalizeName(db, name);
  const id = crypto.randomUUID();
  const passwordHash = await sha256Hex(password);

  await db.prepare(`
    INSERT INTO feedback_posts (id, name, message, password_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(id, normalizedName, String(message).trim(), passwordHash, timestamp, timestamp).run();

  return json({
    item: {
      id,
      name: normalizedName,
      message: String(message).trim(),
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }, { status: 201 });
}

async function proxyRequest(context, method) {
  const apiBase = getApiBase(context.env);
  if (!apiBase) {
    return json({ error: "feedback_api_unavailable", message: "feedback API base is not configured" }, { status: 503 });
  }

  const upstreamUrl = new URL("/api/feedback-posts", `${apiBase}/`);
  const bodyText = method === "POST" ? await context.request.text() : undefined;
  const response = await fetch(upstreamUrl.toString(), {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: bodyText
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export async function onRequestGet(context) {
  const d1Response = await handleD1Get(context.env);
  if (d1Response) return d1Response;
  return proxyRequest(context, "GET");
}

export async function onRequestPost(context) {
  const d1Response = await handleD1Post(context);
  if (d1Response) return d1Response;
  return proxyRequest(context, "POST");
}
