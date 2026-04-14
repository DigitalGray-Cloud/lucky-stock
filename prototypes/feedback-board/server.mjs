import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4180);
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "data", "feedback-board.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback_posts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const app = express();
app.use(express.json({ limit: "256kb" }));

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function validateName(name) {
  const value = String(name || "").trim();
  if (!value) return "이름을 입력해 주세요.";
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
  if (value.length < 4) return "비밀번호는 4자 이상이어야 합니다.";
  if (value.length > 20) return "비밀번호는 20자 이하로 입력해 주세요.";
  return "";
}

function serializePost(row) {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const listPosts = db.prepare(`
  SELECT id, name, message, created_at, updated_at
  FROM feedback_posts
  ORDER BY datetime(created_at) DESC, rowid DESC
`);

const createPost = db.prepare(`
  INSERT INTO feedback_posts (id, name, message, password_hash, created_at, updated_at)
  VALUES (@id, @name, @message, @passwordHash, @createdAt, @updatedAt)
`);

const findPost = db.prepare(`
  SELECT id, name, message, password_hash, created_at, updated_at
  FROM feedback_posts
  WHERE id = ?
`);

const updatePost = db.prepare(`
  UPDATE feedback_posts
  SET name = @name,
      message = @message,
      updated_at = @updatedAt
  WHERE id = @id
`);

const deletePost = db.prepare(`DELETE FROM feedback_posts WHERE id = ?`);

app.get("/api/posts", (_req, res) => {
  const items = listPosts.all().map(serializePost);
  res.set("Cache-Control", "no-store").json({ items });
});

app.post("/api/posts", (req, res) => {
  const { name, message, password } = req.body || {};
  const error = validateName(name) || validateMessage(message) || validatePassword(password);
  if (error) {
    res.status(400).json({ error: "invalid_input", message: error });
    return;
  }

  const timestamp = nowIso();
  const row = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    message: String(message).trim(),
    passwordHash: hashPassword(String(password).trim()),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  createPost.run(row);
  res.status(201).json({
    item: serializePost({
      id: row.id,
      name: row.name,
      message: row.message,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    })
  });
});

app.put("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const { name, message, password } = req.body || {};
  const error = validateName(name) || validateMessage(message) || validatePassword(password);
  if (error) {
    res.status(400).json({ error: "invalid_input", message: error });
    return;
  }

  const existing = findPost.get(id);
  if (!existing) {
    res.status(404).json({ error: "not_found", message: "대상을 찾을 수 없습니다." });
    return;
  }

  if (existing.password_hash !== hashPassword(String(password).trim())) {
    res.status(403).json({ error: "invalid_password", message: "비밀번호가 맞지 않습니다." });
    return;
  }

  const updatedAt = nowIso();
  updatePost.run({
    id,
    name: String(name).trim(),
    message: String(message).trim(),
    updatedAt
  });

  res.json({
    item: serializePost({
      ...existing,
      name: String(name).trim(),
      message: String(message).trim(),
      updated_at: updatedAt
    })
  });
});

app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const password = String(req.body?.password || "").trim();
  const error = validatePassword(password);
  if (error) {
    res.status(400).json({ error: "invalid_input", message: error });
    return;
  }

  const existing = findPost.get(id);
  if (!existing) {
    res.status(404).json({ error: "not_found", message: "대상을 찾을 수 없습니다." });
    return;
  }

  if (existing.password_hash !== hashPassword(password)) {
    res.status(403).json({ error: "invalid_password", message: "비밀번호가 맞지 않습니다." });
    return;
  }

  deletePost.run(id);
  res.status(204).end();
});

app.use(express.static(PUBLIC_DIR, { index: false }));
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[feedback-board] listening on http://localhost:${PORT}`);
  console.log(`[feedback-board] sqlite db: ${DB_PATH}`);
});
