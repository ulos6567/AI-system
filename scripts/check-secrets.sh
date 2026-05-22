#!/usr/bin/env bash
# T077 — .env 평문 노출 점검 (커밋 훅 / CI 단계)
#   - 트래킹된 파일에서 비밀번호/토큰 패턴 탐색
#   - .env.example 은 예외 (값이 없어야 함을 별도로 확인)

set -u
red=$'\033[31m'; yel=$'\033[33m'; nc=$'\033[0m'

FAIL=0

PATTERNS=(
  'DB_PASSWORD=[^[:space:]]+'
  'SESSION_SECRET=[^[:space:]]+'
  'JWT_SECRET=[^[:space:]]+'
  'AWS_SECRET_ACCESS_KEY=[^[:space:]]+'
  'sk-[A-Za-z0-9]{20,}'
  '-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----'
)

# 1) .env 자체가 트래킹되지 않는지
if git ls-files 2>/dev/null | grep -E '(^|/)\.env(\.[^/]+)?$' | grep -v '\.env\.example$'; then
  echo "${red}FAIL${nc}: tracked .env file detected — must be gitignored"
  FAIL=1
fi

# 2) 트래킹된 모든 파일에서 시크릿 패턴 탐색 (.env.example 제외)
for pat in "${PATTERNS[@]}"; do
  if git grep -nE "$pat" -- ':!.env.example' ':!scripts/check-secrets.sh' ':!docker/nginx/*' >/dev/null 2>&1; then
    echo "${red}FAIL${nc}: pattern matched: $pat"
    git grep -nE "$pat" -- ':!.env.example' ':!scripts/check-secrets.sh' ':!docker/nginx/*'
    FAIL=1
  fi
done

# 3) .env.example 의 값 부분이 비어있는지(키만 있는지) 확인
if [ -f .env.example ]; then
  while IFS= read -r line; do
    case "$line" in
      ''|'#'*) continue;;
      *'='*)
        v="${line#*=}"
        # 기본값으로 동작 가능한 비-비밀 키만 허용
        case "${line%%=*}" in
          DB_HOST|DB_PORT|DB_NAME|PORT|NODE_ENV|JWT_EXPIRES_IN|ADAPTER_*|VITE_*|FRONTEND_PORT|PUBLIC_DOMAIN) ;;
          *)
            if [ -n "$v" ]; then
              echo "${yel}WARN${nc}: .env.example has value for sensitive key: $line"
            fi
            ;;
        esac
        ;;
    esac
  done < .env.example
fi

if [ "$FAIL" -ne 0 ]; then
  echo "${red}check-secrets: failed${nc}" >&2
  exit 1
fi
echo "check-secrets: ok"
