#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

LAUNCHER_PID_FILE="data/market-sync-autostart-launcher.pid"
LAUNCHER_HEARTBEAT_FILE="data/market-sync-autostart-launcher.heartbeat"
LAUNCHER_LOG_FILE="data/market-sync-autostart-launcher.log"
LOCK_DIR="/tmp/luckystock-market-sync-autostart-launcher.lock"
ENSURE_WATCHDOG_SCRIPT="/home/user/luckstock/scripts/ensure-market-sync-watchdog.sh"
INTERVAL_SECONDS="${MARKET_SYNC_AUTOSTART_INTERVAL_SECONDS:-60}"
MAX_LOG_BYTES=1048576

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [autostart-launcher] $*" >> "$LAUNCHER_LOG_FILE"
}

rotate_log() {
  if [ -f "$LAUNCHER_LOG_FILE" ] && [ "$(wc -c < "$LAUNCHER_LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
    tail -c 524288 "$LAUNCHER_LOG_FILE" > "${LAUNCHER_LOG_FILE}.tmp" && mv "${LAUNCHER_LOG_FILE}.tmp" "$LAUNCHER_LOG_FILE"
    log "log rotated"
  fi
}

write_heartbeat() {
  date -u +%Y-%m-%dT%H:%M:%SZ > "$LAUNCHER_HEARTBEAT_FILE"
}

cleanup() {
  local exit_code=$?
  rm -f "$LAUNCHER_PID_FILE" "$LAUNCHER_HEARTBEAT_FILE"
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

  log "stale lock detected pid=${existing_pid:-unknown}; recovering"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo "$$" > "$LOCK_DIR/pid"
}

trap cleanup EXIT INT TERM

rotate_log
acquire_lock

echo "$$" > "$LAUNCHER_PID_FILE"
write_heartbeat
log "started pid=$$ interval=${INTERVAL_SECONDS}s"

while true; do
  rotate_log
  write_heartbeat
  bash "$ENSURE_WATCHDOG_SCRIPT" >> "$LAUNCHER_LOG_FILE" 2>&1 || log "ensure-watchdog failed"
  write_heartbeat
  sleep "$INTERVAL_SECONDS"
done
