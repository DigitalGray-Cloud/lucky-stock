#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

LAUNCHER_PID_FILE="data/market-sync-autostart-launcher.pid"
LAUNCHER_HEARTBEAT_FILE="data/market-sync-autostart-launcher.heartbeat"
LAUNCHER_NOHUP_LOG_FILE="data/market-sync-autostart-launcher.nohup.log"
LAUNCHER_LOG_FILE="data/market-sync-autostart-launcher.log"
LOCK_DIR="/tmp/luckystock-market-sync-autostart-launcher-ensure.lock"
MAX_HEARTBEAT_AGE_SECONDS="${AUTOSTART_LAUNCHER_MAX_HEARTBEAT_AGE_SECONDS:-180}"
LAUNCHER_SCRIPT="/home/user/luckstock/scripts/market-sync-autostart-launcher.sh"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [autostart-launcher-ensure] $*" >> "$LAUNCHER_LOG_FILE"
}

cleanup() {
  rm -rf "$LOCK_DIR"
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
    exit 0
  fi

  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo "$$" > "$LOCK_DIR/pid"
}

is_alive_pid_file() {
  local pid_file=$1
  if [ ! -f "$pid_file" ]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    return 1
  fi

  kill -0 "$pid" 2>/dev/null
}

heartbeat_is_fresh() {
  local heartbeat_file=$1
  if [ ! -f "$heartbeat_file" ]; then
    return 1
  fi

  local now file_mtime age
  now=$(date +%s)
  file_mtime=$(date -r "$heartbeat_file" +%s 2>/dev/null || echo 0)
  age=$((now - file_mtime))
  [ "$age" -le "$MAX_HEARTBEAT_AGE_SECONDS" ]
}

stop_pid_from_file() {
  local pid_file=$1
  if [ ! -f "$pid_file" ]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

start_launcher() {
  nohup bash "$LAUNCHER_SCRIPT" >> "$LAUNCHER_NOHUP_LOG_FILE" 2>&1 &
  log "launcher started by ensure pid=$!"
}

trap cleanup EXIT INT TERM

acquire_lock

if is_alive_pid_file "$LAUNCHER_PID_FILE" && heartbeat_is_fresh "$LAUNCHER_HEARTBEAT_FILE"; then
  exit 0
fi

reasons=()
is_alive_pid_file "$LAUNCHER_PID_FILE" || reasons+=("launcher-pid-dead")
heartbeat_is_fresh "$LAUNCHER_HEARTBEAT_FILE" || reasons+=("launcher-heartbeat-stale")
log "restart requested reasons=$(IFS=,; echo "${reasons[*]}")"

stop_pid_from_file "$LAUNCHER_PID_FILE"
rm -f "$LAUNCHER_PID_FILE" "$LAUNCHER_HEARTBEAT_FILE"
rm -rf /tmp/luckystock-market-sync-autostart-launcher.lock
start_launcher
