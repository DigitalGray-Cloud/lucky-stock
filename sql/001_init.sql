CREATE TABLE IF NOT EXISTS stocks (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  market VARCHAR(20) NOT NULL,
  sector VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_analysis (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  favor_score INTEGER NOT NULL CHECK (favor_score >= 0 AND favor_score <= 100),
  signal VARCHAR(20) NOT NULL,
  bull_points TEXT NOT NULL,
  future_outlook TEXT NOT NULL,
  risk TEXT NOT NULL,
  foreign_flow TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code)
);

CREATE INDEX IF NOT EXISTS idx_stock_analysis_updated_at ON stock_analysis(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_analysis_favor_score ON stock_analysis(favor_score DESC);

CREATE TABLE IF NOT EXISTS stock_ranking (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  favor_score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code),
  UNIQUE(rank)
);

CREATE INDEX IF NOT EXISTS idx_stock_ranking_rank ON stock_ranking(rank ASC);

CREATE TABLE IF NOT EXISTS batch_runs (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_runs_started_at ON batch_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS daily_visitors (
  id BIGSERIAL PRIMARY KEY,
  visit_date DATE NOT NULL,
  ip_hash VARCHAR(64) NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 1,
  path VARCHAR(255),
  user_agent TEXT,
  UNIQUE(visit_date, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_daily_visitors_visit_date ON daily_visitors(visit_date DESC);
