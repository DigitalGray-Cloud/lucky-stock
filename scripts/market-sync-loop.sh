#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

LOCK_DIR="/tmp/luckystock-market-sync.lock"
LOG_FILE="data/market-sync-loop.log"
PID_FILE="data/market-sync-loop.pid"
HEARTBEAT_FILE="data/market-sync-loop.heartbeat"
MAX_LOG_BYTES=5242880  # 5MB
SLEEP_SECONDS=600
SLEEP_SLICE_SECONDS=10
NPM_BIN="${NPM_BIN:-/usr/bin/npm}"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] $*" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
    tail -c 2097152 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    log "log rotated"
  fi
}

write_heartbeat() {
  date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT_FILE"
}

cleanup() {
  local exit_code=$?
  rm -rf "$LOCK_DIR"
  rm -f "$PID_FILE"
  log "stopped exit=$exit_code"
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
    log "already running pid=$existing_pid"
    exit 0
  fi

  log "stale lock detected pid=${existing_pid:-unknown}; recovering"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo "$$" > "$LOCK_DIR/pid"
}

sleep_with_heartbeat() {
  local remaining=$SLEEP_SECONDS
  while [ "$remaining" -gt 0 ]; do
    write_heartbeat
    sleep "$SLEEP_SLICE_SECONDS"
    remaining=$((remaining - SLEEP_SLICE_SECONDS))
  done
}

trap cleanup EXIT INT TERM

rotate_log
acquire_lock
echo "$$" > "$PID_FILE"
write_heartbeat
log "started pid=$$"

while true; do
  rotate_log
  write_heartbeat

  START=$(date +%s)
  log "batch begin"

  if "$NPM_BIN" run batch:market-sync:intraday >> "$LOG_FILE" 2>&1; then
    END=$(date +%s)
    log "batch ok elapsed=$((END - START))s"
  else
    END=$(date +%s)
    log "ERROR batch failed elapsed=$((END - START))s"
  fi

  write_heartbeat
  sleep_with_heartbeat
done
