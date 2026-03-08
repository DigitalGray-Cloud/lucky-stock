import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT || 8787),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  analysisCacheHours: Number(process.env.ANALYSIS_CACHE_HOURS || 24),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 60),
  staticDir: ROOT_DIR,
  rootDir: ROOT_DIR
};

if (!config.databaseUrl) {
  console.warn("[config] DATABASE_URL is not set");
}
