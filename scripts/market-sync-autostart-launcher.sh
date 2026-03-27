#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

LAUNCHER_PID_FILE="data/market-sync-autostart-launcher.pid"
LAUNCHER_HEARTBEAT_FILE="data/market-sync-autostart-launcher.heartbeat"
LAUNCHER_LOG_FILE="data/market-sync-autostart-launcher.log"
CHILD_PID_FILE="data/market-sync-autostart.pid"
CHILD_HEARTBEAT_FILE="data/market-sync-autostart.heartbeat"
LOCK_DIR="/tmp/luckystock-market-sync-autostart-launcher.lock"
AUTOSTART_SCRIPT="/home/user/luckstock/scripts/market-sync-autostart.sh"
MAX_LOG_BYTES=1048576
HEARTBEAT_INTERVAL_SECONDS=15
STALE_CHILD_HEARTBEAT_SECONDS=180
CHILD_HEARTBEAT_GRACE_SECONDS=90
RESTART_DELAY_SECONDS=5

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
  if [ -n "${CHILD_PID:-}" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill "$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  fi
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

child_heartbeat_stale() {
  local started_at=$1

  if [ ! -f "$CHILD_HEARTBEAT_FILE" ]; then
    local now_missing
    now_missing=$(date +%s)
    [ $((now_missing - started_at)) -gt "$CHILD_HEARTBEAT_GRACE_SECONDS" ]
    return
  fi

  local now child_mtime age uptime
  now=$(date +%s)
  uptime=$((now - started_at))
  if [ "$uptime" -le "$CHILD_HEARTBEAT_GRACE_SECONDS" ]; then
    return 1
  fi

  child_mtime=$(date -r "$CHILD_HEARTBEAT_FILE" +%s 2>/dev/null || echo 0)
  age=$((now - child_mtime))
  [ "$age" -gt "$STALE_CHILD_HEARTBEAT_SECONDS" ]
}

trap cleanup EXIT INT TERM

rotate_log
acquire_lock

echo "$$" > "$LAUNCHER_PID_FILE"
write_heartbeat
log "started pid=$$"

while true; do
  rotate_log
  write_heartbeat

  local_start=$(date +%s)
  rm -f "$CHILD_HEARTBEAT_FILE"
  bash "$AUTOSTART_SCRIPT" &
  CHILD_PID=$!
  log "child started pid=$CHILD_PID"

  if ! kill -0 "$CHILD_PID" 2>/dev/null; then
    log "child failed to stay alive pid=$CHILD_PID; retrying in ${RESTART_DELAY_SECONDS}s"
    sleep "$RESTART_DELAY_SECONDS"
    continue
  fi

  child_exit=0
  while kill -0 "$CHILD_PID" 2>/dev/null; do
    write_heartbeat
    if child_heartbeat_stale "$local_start"; then
      log "child heartbeat stale pid=$CHILD_PID; terminating for restart"
      kill "$CHILD_PID" 2>/dev/null || true
      wait "$CHILD_PID" 2>/dev/null || true
      child_exit=1
      break
    fi
    sleep "$HEARTBEAT_INTERVAL_SECONDS"
  done

  if [ "$child_exit" -eq 0 ]; then
    if wait "$CHILD_PID"; then
      child_exit=0
    else
      child_exit=$?
    fi
  fi

  local_end=$(date +%s)
  uptime=$((local_end - local_start))
  log "child exited pid=$CHILD_PID exit=$child_exit uptime=${uptime}s; restarting in ${RESTART_DELAY_SECONDS}s"
  sleep "$RESTART_DELAY_SECONDS"
 done
