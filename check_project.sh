#!/usr/bin/env bash
# check_project.sh — mis2601 서비스(백엔드/프론트엔드) 시작·종료·재시작 관리
#
#   사용법:
#     ./check_project.sh start     # 백엔드(9532) + 프론트엔드(9512) 시작
#     ./check_project.sh stop      # 두 서비스 종료
#     ./check_project.sh restart   # 종료 후 재시작
#     ./check_project.sh status    # 현재 상태 확인 (보너스)
#
#   - PID/로그는 .run/ 디렉터리에 저장됩니다 (로그는 .gitignore 처리됨).
#   - 종료 시 PID 파일과 포트 점유 프로세스를 모두 정리해 nodemon 자식까지 회수합니다.

set -u

# ── 경로 / 설정 ───────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
ENV_FILE="$ROOT/.env"

# .env 에서 포트 읽기 (없으면 기본값)
BACKEND_PORT="$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
FRONTEND_PORT="$(grep -E '^FRONTEND_PORT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
BACKEND_PORT="${BACKEND_PORT:-9532}"
FRONTEND_PORT="${FRONTEND_PORT:-9512}"

BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

# ── 색상 ──────────────────────────────────────────────────────
grn=$'\033[32m'; red=$'\033[31m'; yel=$'\033[33m'; cyn=$'\033[36m'; nc=$'\033[0m'
ok()   { echo "${grn}✔${nc} $*"; }
warn() { echo "${yel}!${nc} $*"; }
err()  { echo "${red}✘${nc} $*"; }
info() { echo "${cyn}▸${nc} $*"; }

# ── 헬퍼 ──────────────────────────────────────────────────────
# 포트를 LISTEN 중인 PID 목록
port_pids() { lsof -ti ":$1" -sTCP:LISTEN 2>/dev/null; }

# PID 가 살아있는지
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# 단일 서비스 시작
#   $1 라벨  $2 작업디렉터리  $3 PID파일  $4 로그파일  $5 포트
start_one() {
  local label="$1" dir="$2" pidfile="$3" logfile="$4" port="$5"

  if [ -n "$(port_pids "$port")" ]; then
    warn "$label 이미 실행 중 (포트 $port) — 건너뜀"
    return 0
  fi

  info "$label 시작 중… (포트 $port)"
  ( cd "$dir" && exec npm run dev ) >"$logfile" 2>&1 &
  echo $! >"$pidfile"
}

# 단일 서비스 종료
stop_one() {
  local label="$1" pidfile="$2" port="$3"
  local stopped=0

  # 1) PID 파일 기반 종료 (자식 프로세스 그룹 포함 시도)
  if [ -f "$pidfile" ]; then
    local pid; pid="$(cat "$pidfile" 2>/dev/null)"
    if alive "$pid"; then
      kill "$pid" 2>/dev/null && stopped=1
    fi
    rm -f "$pidfile"
  fi

  # 2) 포트 점유 프로세스 정리 (nodemon→ts-node 자식 등 회수)
  local pids; pids="$(port_pids "$port")"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null
    stopped=1
    # 정상 종료 대기 후 강제 종료
    for _ in 1 2 3 4 5; do
      pids="$(port_pids "$port")"; [ -z "$pids" ] && break
      sleep 0.5
    done
    pids="$(port_pids "$port")"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  fi

  if [ "$stopped" -eq 1 ]; then ok "$label 종료 (포트 $port)"; else warn "$label 실행 중 아님"; fi
}

# 헬스 체크 대기 (백엔드)
wait_backend() {
  info "백엔드 헬스 체크 대기…"
  for _ in $(seq 1 20); do
    if curl -fsS "http://localhost:$BACKEND_PORT/api/healthz" >/dev/null 2>&1; then
      ok "백엔드 정상 (http://localhost:$BACKEND_PORT/api/healthz)"
      return 0
    fi
    sleep 0.5
  done
  err "백엔드 헬스 체크 실패 — 로그: $BACKEND_LOG"
  return 1
}

wait_frontend() {
  info "프론트엔드 기동 대기…"
  for _ in $(seq 1 20); do
    if curl -fsS -o /dev/null "http://localhost:$FRONTEND_PORT/" 2>/dev/null; then
      ok "프론트엔드 정상 (http://localhost:$FRONTEND_PORT/)"
      return 0
    fi
    sleep 0.5
  done
  err "프론트엔드 기동 실패 — 로그: $FRONTEND_LOG"
  return 1
}

# ── 명령 ──────────────────────────────────────────────────────
cmd_start() {
  mkdir -p "$RUN_DIR"
  start_one "백엔드"   "$ROOT/backend"  "$BACKEND_PID"  "$BACKEND_LOG"  "$BACKEND_PORT"
  wait_backend || true
  start_one "프론트엔드" "$ROOT/frontend" "$FRONTEND_PID" "$FRONTEND_LOG" "$FRONTEND_PORT"
  wait_frontend || true
  echo
  ok "기동 완료 — http://localhost:$FRONTEND_PORT/"
}

cmd_stop() {
  stop_one "프론트엔드" "$FRONTEND_PID" "$FRONTEND_PORT"
  stop_one "백엔드"   "$BACKEND_PID"  "$BACKEND_PORT"
}

cmd_restart() {
  info "재시작…"
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  local b f
  b="$(port_pids "$BACKEND_PORT")"; f="$(port_pids "$FRONTEND_PORT")"
  if [ -n "$b" ]; then ok "백엔드   실행 중 (포트 $BACKEND_PORT, PID $(echo $b | tr '\n' ' '))"; else err "백엔드   중지 (포트 $BACKEND_PORT)"; fi
  if [ -n "$f" ]; then ok "프론트엔드 실행 중 (포트 $FRONTEND_PORT, PID $(echo $f | tr '\n' ' '))"; else err "프론트엔드 중지 (포트 $FRONTEND_PORT)"; fi
}

usage() {
  cat <<EOF
사용법: $(basename "$0") {start|stop|restart|status}

  start    백엔드($BACKEND_PORT) + 프론트엔드($FRONTEND_PORT) 시작
  stop     두 서비스 종료
  restart  종료 후 재시작
  status   현재 실행 상태 확인
EOF
  exit 1
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  *)       usage ;;
esac
