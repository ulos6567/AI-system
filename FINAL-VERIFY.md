# FINAL — 전체 구현 검증 (T001~T079, 79/79)

> 완료 일자: 2026-05-22 · Branch: `001-ai-store-ops`
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

본 문서는 79개 작업이 모두 마무리된 상태의 통합 검증 가이드입니다. 각 마일스톤별 상세는 `M0/US1/US2/US3/US4/US5-VERIFY.md` 참조.

## 0. 초기 1회 실행 절차

```bash
cd /Users/pioneer12/mis2601
cp .env.example .env       # DB_USER/PASSWORD/SESSION_SECRET/JWT_SECRET 채움

# 1) DB 부팅 + 마이그레이션 + 시드
docker compose -f docker/docker-compose.yml up -d mariadb
cd backend && npm install && npm run db:migrate && npm run db:seed && cd ..

# 2) 백엔드 (포트 9532)
( cd backend && npm run dev ) &

# 3) 프론트엔드 (포트 9512)
( cd frontend && npm install && npm run dev ) &
```

브라우저: `http://localhost:9512` → `store_owner_demo@example.com / demo1234` 로그인.

## 1. 백엔드 자동 시작 잡 (5종)

부팅 로그에서 확인:
```
{ ... } signal-poll started        intervalMin=30
{ ... } auto-order scheduler started intervalMin=30
{ ... } local-buffer worker started  intervalSec=15
{ ... } pricing-trigger started      intervalMin=15
{ ... } kpi-aggregate started        intervalMin=60
```

## 2. 라우터·화면 매트릭스 (8개 메뉴)

| 메뉴 | URL | 백엔드 라우터 | 핵심 작업 |
|------|-----|--------------|----------|
| 발주 | `/orders` | `/api/stores/:id/orders`, `/forecasts` | T030·T034·T039 |
| 재고 | `/inventory` | `/api/stores/:id/inventory` | T043·T047 |
| 거래/매출 | `/transactions` | `/api/stores/:id/transactions` | T044·T048 |
| 가격 룰 | `/pricing/rules` | `/api/pricing/rules` | T053·T057 |
| 가격 이력 | `/pricing/events` | `/api/stores/:id/pricing-events` | T054·T058 |
| 리포트 | `/reports` | `/api/stores/:id/reports/daily` | T060·T062 |
| 셀프 결제 | `/self-checkout` | `/transactions/ingest`, `/products/lookup`, `/vision/*`, `/analytics/*` | T064·T065 |
| 매핑 검토 | `/mappings` | `/api/stores/:id/product-mappings` | T067 |

## 3. 운영 진단 엔드포인트

```bash
# 헬스
curl -s http://localhost:9532/api/healthz | python3 -m json.tool
# { "status": "ok", "online": true, "buffered": 0, ... }

# 준비 상태
curl -s http://localhost:9532/api/readyz

# 메트릭 (T079)
curl -s http://localhost:9532/api/metrics | python3 -m json.tool
# {
#   "db": { "ok": true, "online": true, "bufferedTransactions": 0 },
#   "counts": { "users":4, "activeStores":3, "ordersPendingReview":..., "errorsLast24h":..., ... },
#   "process": { "memMB": {...}, "node": "v20.x", ... },
#   "uptimeSec": 142
# }

# OpenAPI (dev only)
open http://localhost:9532/api/docs
```

## 4. 보안 검증

### 4-1. 시크릿 점검
```bash
git init -q   # 미초기화 상태라면
bash scripts/check-secrets.sh
# → "check-secrets: ok"
```

### 4-2. PII 가드
```bash
# 점주 계정으로 PII 접근 시도 (403 + audit)
curl -s -b /tmp/c.txt http://localhost:9532/api/pii/users/1/consent
# { "type":"about:blank", "title":"...", "status":403, ... }  ← RFC 7807

# admin/HQ_OPERATOR 로그인 → 통과
curl -s -c /tmp/admin.txt -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"hq@example.com","password":"demo1234"}'
curl -s -b /tmp/admin.txt http://localhost:9532/api/pii/users/1/consent

# DB 에서 audit 확인
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "SELECT event_type, message, occurred_at FROM event_log
     WHERE event_type LIKE 'pii.%' ORDER BY id DESC LIMIT 5;"
```

### 4-3. RFC 7807 응답
RFC 7807 미들웨어는 `next(err)` 또는 `HttpProblem` throw 시 활성화됩니다. 기존 라우터의 ad-hoc `{ error }` 응답은 호환을 위해 유지.

## 5. 테스트 실행

```bash
# 백엔드 통합 (DB 없이 통과하는 스모크)
cd backend && npm test

# 프론트 단위 (vi.mock 으로 API 격리)
cd ../frontend && npm test
```

## 6. Docker 풀스택 빌드

```bash
docker compose -f docker/docker-compose.yml up --build
# - mariadb (3306 내부)
# - backend  (9532)
# - frontend (9512, nginx 정적 호스팅)
# - nginx    (80 → backend:9532 + frontend:9512, server_name p12.sumzip.com)

# /etc/hosts: 127.0.0.1 p12.sumzip.com  추가 후
open http://p12.sumzip.com/
```

## 7. CI 파이프라인 (`.gitlab-ci.yml`)

6단계: **secret-scan → lint → test → build → docker → deploy**
- `secret-scan`: `scripts/check-secrets.sh` (모든 브랜치/MR)
- `docker`: backend/frontend 양쪽 :SHA + :latest 푸시 (main only)
- `deploy:staging`: 자동, `p12.sumzip.com`
- `deploy:prod`: manual

## 8. 79개 작업 일람 (마일스톤별)

| 마일스톤 | 범위 | 누적 | 핵심 산출 |
|---------|------|------|----------|
| M0 | Setup + Foundational (T001~T024) | 24 | 모노레포·DB 8종·인증·SSE·어댑터 |
| M1 | + US1 MVP (T025~T039) | 39 | 자동 발주 end-to-end |
| M2 | + US2 (T040~T049) | 49 | 실시간 알림·재고/거래 화면·오프라인 |
| M3 | + US3 (T050~T058) | 58 | 동적 가격 룰·ESL/Push·이력 |
| M4 | + US4 (T059~T062) | 62 | KPI 집계·리포트 차트 |
| M5 | + US5 (T063~T065) | 65 | 셀프 결제·Vision 모의 |
| **최종** | + Polish (T066~T079) | **79** | PII·감사 파티션·RFC7807·OpenAPI·테스트·Docker·CI·시크릿·i18n·메트릭 |

## 9. 알려진 한계 (1차 범위 외)

- **AS5 음성 어시스턴트** (FR-013): 미구현, 후속 단계
- **실제 Vision AI 추론**: mock 어댑터만 — 실제 카메라 연동은 vendor SDK 단계에서
- **labor_cost**: KPI 컬럼만 존재, 데이터 소스 미정으로 NULL
- **i18n**: 골격만 — 컴포넌트 메시지는 한국어 하드코딩 상태(점진 치환)
- **node-cron**: 1차는 `setInterval` 폴링. 정밀 cron 표현식 필요 시 후속
- **PII_ACCESS 별도 권한 테이블**: 현재는 글로벌 역할만으로 판단

## 10. 다음 단계 권장

1. 실 데이터 시범 매장 4주 운영 → SC-001~010 정량 검증
2. 외부 어댑터 real 구현 (KMA·FCM·ESL 벤더·물류 EDI)
3. node-cron 도입으로 자동 발주/가격 트리거 정밀 스케줄
4. labor_cost 데이터 소스 연계 (POS 시스템 또는 별도 인사 시스템)
5. 컴포넌트의 i18n 키 치환 + 영문 화면 활성화
