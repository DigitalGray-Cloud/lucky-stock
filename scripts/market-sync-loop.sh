#!/usr/bin/env bash
set -euo pipefail

cd /home/user/luckstock

LOCK_FILE="/tmp/luckystock-market-sync.lock"
LOG_FILE="data/market-sync-loop.log"
MAX_LOG_BYTES=5242880  # 5MB

# 로그 로테이션 (5MB 초과 시 잘라냄)
rotate_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
    tail -c 2097152 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] log rotated" >> "$LOG_FILE"
  fi
}

# 이미 실행 중이면 종료 (중복 실행 방지)
if ! exec 9>"$LOCK_FILE"; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] failed to open lock file" >> "$LOG_FILE"
  exit 1
fi

if ! flock -n 9; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] already running, skipping" >> "$LOG_FILE"
  exit 0
fi

trap 'flock -u 9; exec 9>&-; rm -f "$LOCK_FILE"' EXIT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] started pid=$$" >> "$LOG_FILE"

while true; do
  rotate_log

  START=$(date +%s)
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] batch begin" >> "$LOG_FILE"

  if /usr/bin/npm run batch:market-sync:intraday >> "$LOG_FILE" 2>&1; then
    END=$(date +%s)
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] batch ok elapsed=$((END - START))s" >> "$LOG_FILE"
  else
    END=$(date +%s)
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] ERROR batch failed elapsed=$((END - START))s" >> "$LOG_FILE"
  fi

  sleep 600
done
