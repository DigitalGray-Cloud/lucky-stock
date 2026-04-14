#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

PID_FILE="data/market-sync-autostart.pid"
HEARTBEAT_FILE="data/market-sync-autostart.heartbeat"
LOG_FILE="data/market-sync-autostart.log"
LOCK_DIR="/tmp/luckystock-market-sync-autostart.lock"
INTERVAL_SECONDS="${MARKET_SYNC_AUTOSTART_INTERVAL_SECONDS:-60}"
MAX_LOG_BYTES=1048576

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [autostart] $*" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
    tail -c 524288 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
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

  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo "$$" > "$LOCK_DIR/pid"
}

trap cleanup EXIT INT TERM

acquire_lock
rotate_log
write_heartbeat
echo "$$" > "$PID_FILE"
log "started pid=$$ interval=${INTERVAL_SECONDS}s"

while true; do
  rotate_log
  write_heartbeat
  bash /home/user/luckstock/scripts/ensure-market-sync-watchdog.sh >> "$LOG_FILE" 2>&1 || log "ensure-watchdog failed"
  write_heartbeat
  sleep "$INTERVAL_SECONDS"
done
