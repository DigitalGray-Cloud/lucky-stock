#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

SUPERVISOR_PID_FILE="data/market-sync-supervisor.pid"
SUPERVISOR_HEARTBEAT_FILE="data/market-sync-supervisor.heartbeat"
SUPERVISOR_NOHUP_LOG_FILE="data/market-sync-supervisor.nohup.log"
SUPERVISOR_LOG_FILE="data/market-sync-supervisor.log"
CHILD_PID_FILE="data/market-sync-loop.pid"
CHILD_HEARTBEAT_FILE="data/market-sync-loop.heartbeat"
LOCK_DIR="/tmp/luckystock-market-sync-ensure.lock"
MAX_HEARTBEAT_AGE_SECONDS=1200
SUPERVISOR_SCRIPT="/home/user/luckstock/scripts/market-sync-supervisor.sh"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [ensure] $*" >> "$SUPERVISOR_LOG_FILE"
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

start_supervisor() {
  nohup bash "$SUPERVISOR_SCRIPT" < /dev/null >> "$SUPERVISOR_NOHUP_LOG_FILE" 2>&1 &
  log "supervisor started by ensure pid=$!"
}

trap cleanup EXIT INT TERM

acquire_lock

if is_alive_pid_file "$SUPERVISOR_PID_FILE" && heartbeat_is_fresh "$SUPERVISOR_HEARTBEAT_FILE" && is_alive_pid_file "$CHILD_PID_FILE" && heartbeat_is_fresh "$CHILD_HEARTBEAT_FILE"; then
  exit 0
fi

reasons=()
is_alive_pid_file "$SUPERVISOR_PID_FILE" || reasons+=("supervisor-pid-dead")
heartbeat_is_fresh "$SUPERVISOR_HEARTBEAT_FILE" || reasons+=("supervisor-heartbeat-stale")
is_alive_pid_file "$CHILD_PID_FILE" || reasons+=("child-pid-dead")
heartbeat_is_fresh "$CHILD_HEARTBEAT_FILE" || reasons+=("child-heartbeat-stale")
log "restart requested reasons=$(IFS=,; echo "${reasons[*]}")"

stop_pid_from_file "$CHILD_PID_FILE"
stop_pid_from_file "$SUPERVISOR_PID_FILE"
rm -f "$SUPERVISOR_PID_FILE" "$SUPERVISOR_HEARTBEAT_FILE" "$CHILD_PID_FILE"
rm -rf /tmp/luckystock-market-sync.lock
start_supervisor
