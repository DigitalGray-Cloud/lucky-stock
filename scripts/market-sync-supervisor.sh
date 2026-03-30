#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

SUPERVISOR_PID_FILE="data/market-sync-supervisor.pid"
SUPERVISOR_LOG_FILE="data/market-sync-supervisor.log"
SUPERVISOR_HEARTBEAT_FILE="data/market-sync-supervisor.heartbeat"
CHILD_PID_FILE="data/market-sync-loop.pid"
CHILD_HEARTBEAT_FILE="data/market-sync-loop.heartbeat"
MAX_LOG_BYTES=2097152
MIN_UPTIME_SECONDS=30
RESTART_DELAY_SECONDS=5
MAX_RESTART_DELAY_SECONDS=300
HEARTBEAT_INTERVAL_SECONDS=15
STALE_CHILD_HEARTBEAT_SECONDS=1200
CHILD_HEARTBEAT_GRACE_SECONDS=90
LOOP_SCRIPT="/home/user/luckstock/scripts/market-sync-loop.sh"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [supervisor] $*" >> "$SUPERVISOR_LOG_FILE"
}

rotate_log() {
  if [ -f "$SUPERVISOR_LOG_FILE" ] && [ "$(wc -c < "$SUPERVISOR_LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
    tail -c 1048576 "$SUPERVISOR_LOG_FILE" > "${SUPERVISOR_LOG_FILE}.tmp" && mv "${SUPERVISOR_LOG_FILE}.tmp" "$SUPERVISOR_LOG_FILE"
    log "log rotated"
  fi
}

write_heartbeat() {
  date -u +%Y-%m-%dT%H:%M:%SZ > "$SUPERVISOR_HEARTBEAT_FILE"
}

start_heartbeat_writer() {
  (
    while true; do
      write_heartbeat
      sleep "$HEARTBEAT_INTERVAL_SECONDS"
    done
  ) &
  HEARTBEAT_WRITER_PID=$!
}

cleanup() {
  local exit_code=$?
  if [ -n "${HEARTBEAT_WRITER_PID:-}" ] && kill -0 "$HEARTBEAT_WRITER_PID" 2>/dev/null; then
    kill "$HEARTBEAT_WRITER_PID" 2>/dev/null || true
    wait "$HEARTBEAT_WRITER_PID" 2>/dev/null || true
  fi
  if [ -n "${CHILD_PID:-}" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill "$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  fi
  rm -f "$SUPERVISOR_PID_FILE"
  rm -f "$SUPERVISOR_HEARTBEAT_FILE"
  log "stopped exit=$exit_code"
}

acquire_supervisor_slot() {
  if [ -f "$SUPERVISOR_PID_FILE" ]; then
    local existing_pid
    existing_pid="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      log "already running pid=$existing_pid"
      exit 0
    fi
    log "stale pid file detected pid=${existing_pid:-unknown}; recovering"
  fi

  echo "$$" > "$SUPERVISOR_PID_FILE"
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
acquire_supervisor_slot
write_heartbeat
start_heartbeat_writer
log "started pid=$$"

while true; do
  rotate_log
  write_heartbeat

  local_start=$(date +%s)
  rm -f "$CHILD_HEARTBEAT_FILE"
  nohup bash "$LOOP_SCRIPT" < /dev/null > /dev/null 2>&1 &
  CHILD_PID=$!
  echo "$CHILD_PID" > "$CHILD_PID_FILE"
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

  if [ "$uptime" -lt "$MIN_UPTIME_SECONDS" ]; then
    RESTART_DELAY_SECONDS=$((RESTART_DELAY_SECONDS * 2))
    if [ "$RESTART_DELAY_SECONDS" -gt "$MAX_RESTART_DELAY_SECONDS" ]; then
      RESTART_DELAY_SECONDS=$MAX_RESTART_DELAY_SECONDS
    fi
  else
    RESTART_DELAY_SECONDS=5
  fi

  log "child exited pid=$CHILD_PID exit=$child_exit uptime=${uptime}s; restarting in ${RESTART_DELAY_SECONDS}s"
  sleep "$RESTART_DELAY_SECONDS"
done
