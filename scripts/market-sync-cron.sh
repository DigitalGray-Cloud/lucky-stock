#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

LOCK_DIR="/tmp/luckystock-market-sync-cron.lock"
LOG_FILE="data/market-sync-cron.log"
PID_FILE="data/market-sync-cron.pid"
HEARTBEAT_FILE="data/market-sync-cron.heartbeat"
MAX_LOG_BYTES=2097152
NPM_BIN="${NPM_BIN:-/usr/bin/npm}"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [market-sync-cron] $*" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
    tail -c 1048576 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    log "log rotated"
  fi
}

write_heartbeat() {
  date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT_FILE"
}

cleanup() {
  local exit_code=$?
  rm -f "$PID_FILE"
  rm -rf "$LOCK_DIR"
  write_heartbeat
  log "finished exit=$exit_code"
}

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$LOCK_DIR/pid"
    return
  fi

  local existing_pid=""
  if [ -f "$LOCK_DIR/pid" ]; then
    existing_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  fi

  if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
    log "skipped already running pid=$existing_pid"
    exit 0
  fi

  log "stale lock detected pid=${existing_pid:-unknown}; recovering"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo "$$" > "$LOCK_DIR/pid"
}

trap cleanup EXIT INT TERM

rotate_log
acquire_lock
echo "$$" > "$PID_FILE"
write_heartbeat
log "started pid=$$"

START=$(date +%s)
if "$NPM_BIN" run batch:market-sync:intraday >> "$LOG_FILE" 2>&1; then
  END=$(date +%s)
  log "ok elapsed=$((END - START))s"
else
  END=$(date +%s)
  log "ERROR failed elapsed=$((END - START))s"
  exit 1
fi
