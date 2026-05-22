# Tasks: AI 기반 점포 운영 시스템 (AI Store Operations Platform)

**Feature Branch**: `001-ai-store-ops`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data**: [data-model.md](./data-model.md) · **API**: [contracts/api.yaml](./contracts/api.yaml) · **Research**: [research.md](./research.md) · **Quickstart**: [quickstart.md](./quickstart.md) · **Skills**: [Intent-Tasks.md](./Intent-Tasks.md)
**Created**: 2026-05-22
**Status**: ✅ ALL PHASES (T001~T079, 79/79) implemented — 2026-05-22

---

## 표기 약속

- **[P]** — 다른 파일을 다루며 같은 단계 내에서 병렬 실행 가능 (동일 파일은 순차)
- **[Story]** — 해당 작업이 속한 사용자 스토리 (US1~US5) 표시
- **체크포인트** — 각 스토리 단계 종료 시 단독 동작·테스트 가능한 incremental delivery 시점
- 경로는 모두 저장소 루트 기준
- 테스트 작업은 본 명세에서 명시 요구하지 않아 별도 phase 미생성. 대신 plan.md의 "각 백엔드 라우터 PR에 통합 테스트 1개 이상" 원칙에 따라 라우터 작업 description에 통합 테스트 포함을 명시
- Intent-Tasks.md Skills: `/frontend-design`(컴포넌트·UI), `/responsive-layout`(반응형), `/api-development`(REST) — 해당 작업에 표기

---

## 사용자 스토리 → 우선순위 매핑 (spec.md 근거)

| ID | 스토리 | 우선순위 | 출처 |
|----|-------|---------|------|
| **US1** | 가맹점주가 다음 영업일 자동 발주를 모바일로 검토·수정·확정 | **P1 (MVP)** | spec.md Primary Story + AS1 + plan.md "1번 시나리오 수직 슬라이스" |
| **US2** | 점주가 외부에서 결품·이상거래·장애 알림을 30초 이내 수신 | **P2** | spec.md AS4 (Primary Story 보조) + FR-016 |
| **US3** | 유통기한 임박·외부 변수 감지 시 동적 가격·푸시 마케팅 자동 실행 | **P3** | spec.md AS2 + FR-007~009 |
| **US4** | 시범 매장 4주 운영 데이터의 폐기율·매출·MAPE 자동 리포트 | **P4** | spec.md AS6 + FR-022 + SC-001~010 |
| **US5** | 고객 셀프 결제·Vision 동선 데이터 수집 (1차 모의 어댑터) | **P5** | spec.md AS3 + FR-011~012 |

> **범위 외(1차 명시 제외)**: AS5 음성 어시스턴트(FR-013), AS3의 실제 Vision 인식, 완전 무인 매장 — 후속 단계

---

## Phase 1: Setup (프로젝트 초기화)

> 공유 인프라. 모든 스토리의 사전 조건.

- [X] **T001** [P] 저장소 루트 모노레포 골격 생성 — `frontend/`, `backend/`, `db/migrations/`, `db/seeds/`, `docker/`, `.env.example`, `.gitignore`(.env 제외 필수), `.gitlab-ci.yml` 빈 골격. 산출: 디렉터리 트리 + 빈 README들
- [X] **T002** [P] Vue 3.4 + TypeScript + Vite 5 + Pinia 프론트 부트스트랩 — `frontend/package.json`, `frontend/vite.config.ts`(/api → :9532 프록시, **포트 9512 strict**), `frontend/src/main.ts`, `frontend/tsconfig.json`. ※ Vue Router는 T035에서 추가
- [X] **T003** [P] Express 4 + TypeScript 5 백엔드 부트스트랩 — `backend/package.json`, `backend/tsconfig.json`, `backend/src/index.ts`(Express 앱·헬스체크 `/api/healthz`, **포트 9532**), `nodemon`, `ts-node`, `pino`(구조화 로깅) 설치
- [X] **T004** [P] `.env.example` 작성 — DB·SESSION·JWT·ADAPTER_*·PORT(9532)·FRONTEND_PORT(9512)·PUBLIC_DOMAIN(p12.sumzip.com). 실제 `.env`는 커밋 금지(`.gitignore` 확인)
- [X] **T005** [P] `docker/docker-compose.yml` 스텁 — services: `frontend(9512)`, `backend(9532)`, `mariadb(3306 내부)`, `nginx(80/443, server_name p12.sumzip.com, SSE 친화 설정)`
- [X] **T006** [P] ESLint + Prettier + EditorConfig 통일 — 루트 `.eslintrc.json`/`.prettierrc.json`/`.editorconfig`. `npm run lint` 스크립트

**Checkpoint Setup**: `npm run dev`로 frontend/backend 모두 부팅, `docker compose up mariadb` 동작.

---

## Phase 2: Foundational (모든 스토리의 차단 선행조건)

> 인증·DB 스키마·어댑터 포트·SSE 인프라 — 이 단계 완료 전엔 어떤 스토리도 시작 불가.

### 2-A. 데이터베이스 스키마 & 시드

- [X] **T007** MariaDB 연결 모듈 — `backend/src/db/pool.ts` (mysql2 pool, `.env` 자격증명, 평문 금지)
- [X] **T008** 마이그레이션 러너 — `backend/src/db/migrate.ts` + `npm run db:migrate`(`_migrations` 멱등 테이블, sha256 체크섬). 시드 러너 `seed.ts` 동반(`npm run db:seed`). R-005
- [X] **T009** [P] `db/migrations/001_store_user.sql` — `store`, `user`, `store_user` (§1)
- [X] **T010** [P] `db/migrations/002_product.sql` — `product_master`, `product_local_mapping` (§2)
- [X] **T011** [P] `db/migrations/003_inventory.sql` — `inventory`, `inventory_history` (§2)
- [X] **T012** [P] `db/migrations/004_transaction.sql` — `transaction`, `transaction_item` + `(store_id, occurred_at DESC)` 인덱스 (§3)
- [X] **T013** [P] `db/migrations/005_forecast_order.sql` — `demand_forecast`, `purchase_order`, `purchase_order_item` (§4)
- [X] **T014** [P] `db/migrations/006_pricing_signal.sql` — `pricing_rule`, `pricing_event`, `external_signal` (§5, §6)
- [X] **T015** [P] `db/migrations/007_pii_analytics.sql` — `pii_app_user`, `pii_app_user_consent`, `analytics_customer_behavior` (§7, §8). PII/분석 명명 분리
- [X] **T016** [P] `db/migrations/008_event_kpi.sql` — `event_log`, `notification`, `performance_kpi_daily` (§9, §10) + 인덱스
- [X] **T017** [P] `db/seeds/01_demo.sql` + `02_transactions.sql` — 점포 3곳, 마스터 상품 25종(축약), 점포별 로컬 매핑, 초기 재고(임박 일자 포함), 7일치 거래, 외부 신호 4건. 데모 사용자 4역할은 `seed.ts`에서 bcrypt 해시 후 적재(비번: `demo1234`). ※ 12주 거래 시계열은 후속 잡으로 확장 예정

### 2-B. 인증·권한·로깅

- [X] **T018** 세션·JWT 하이브리드 인증 — `backend/src/middleware/auth/session.ts`(express-session, httpOnly+SameSite=lax), `auth/jwt.ts`(모바일·외부용 Bearer). R-003. bcrypt 해시 검증
- [X] **T019** RBAC + 점포 스코프 가드 — `backend/src/middleware/rbac.ts` 4역할 + `requireStoreScope()` + `requirePiiAccess()`. FR-019
- [X] **T020** `/api/auth/{login, logout, me}` — `backend/src/routes/auth.ts` + zod 검증 + `services/user-loader.ts`(store_user 합산) + `tests/auth.test.ts`(supertest)
- [X] **T021** 구조화 로거 + 감사 헬퍼 — `backend/src/lib/logger.ts`(pino JSON, dev는 pretty) + `backend/src/lib/audit.ts`(`event_log` 적재 단일 진입점). FR-021

### 2-C. 어댑터 포트 & 실시간 인프라

- [X] **T022** [P] 어댑터 포트 인터페이스 — `backend/src/ports/{pos,forecast,push,esl,logistics,signal,vision}.ts` 7종. R-004 헥사고날
- [X] **T023** [P] 어댑터 팩토리 — `backend/src/adapters/factory.ts`(env `ADAPTER_*` 기준 mock/real 분기) + 7종 mock 스켈레톤(`adapters/{pos,push,esl,logistics,signal,vision}/mock.ts`, `forecast/baseline.ts`)
- [X] **T024** [P] SSE 인프라 헬퍼 — `backend/src/lib/sse.ts`(채널 EventBus, 30초 하트비트, `X-Accel-Buffering: no`) + Nginx `proxy_buffering off`/`proxy_read_timeout 1h` 적용(`docker/nginx/default.conf`). R-002

**Checkpoint Foundational**: `npm run db:migrate && npm run db:seed` 성공, `POST /api/auth/login` 후 `GET /api/auth/me` 통과. PII 가드·SSE·어댑터 팩토리가 골격으로 동작.

> **M0 구현 완료 (2026-05-22)**. 검증 절차는 [M0-VERIFY.md](../../M0-VERIFY.md) 참조. 다음 단계: Phase 3 (US1, T025~T039).

---

## Phase 3: User Story 1 — 자동 발주 모니터링 (P1 · MVP) 🎯

**Story Goal**: 가맹점주가 다음 영업일의 품목별 예측을 확인하고, 자동 생성된 발주를 검토·수정·확정하여 물류사로 송신한다. plan.md "1번 시나리오 end-to-end 수직 슬라이스".

**Independent Test**: 데모 점주 계정으로 로그인 → 발주 화면 진입 → "내일자 예측" 표시 → "자동 발주 생성" 클릭 → 비정상 발주는 보류 상태(`pending_review`)로, 정상 발주는 `approved`로 전이 → 물류 mock 어댑터에 송신 → `event_log`에 감사 기록 잔존.

**관련 FR/SC**: FR-001, FR-002, FR-004, FR-005, FR-006, FR-017, FR-019, FR-021 / SC-002, SC-013

### 백엔드 — 데이터 수집

- [X] **T025** [P] [US1] POS 모의 어댑터 — `backend/src/adapters/pos/mock.ts` (JSON/CSV ingestBatch + 시뮬레이션 startStream, 매핑 미해소는 rejected 처리, 트랜잭션 단위 커밋, inventory+inventory_history 자동 차감). FR-001
- [X] **T026** [US1] `POST /api/stores/{storeId}/transactions/ingest` 라우터 — `backend/src/routes/transactions.ts` (JSON·CSV 본문 처리, zod 검증, RBAC+store scope 가드)
- [X] **T027** [P] [US1] 외부 신호 어댑터 — `backend/src/adapters/signal/weather-kma.ts`(KMA API + 키 없을 시 mock 폴백) + `backend/src/jobs/signal-poll.ts`(30분 주기 + 부팅 즉시 1회). FR-002

### 백엔드 — 예측 & 발주

- [X] **T028** [P] [US1] 상품 매핑 서비스 — `backend/src/services/product-mapping.ts`(barcode·master_code 정확매치 → 이름 substring 휴리스틱, 신뢰도<0.7 → pending + audit). FR-004
- [X] **T029** [P] [US1] 수요 예측 서비스 — `backend/src/services/forecast.ts`(28일 lookback 동일 요일 평균 + 강우 -8~20% 가중 + event 신호 +20% 가중, demand_forecast upsert). FR-005, R-001
- [X] **T030** [US1] `GET/POST /api/stores/{storeId}/forecasts` 라우터 — `backend/src/routes/forecasts.ts` (GET 조회 + POST /generate 강제 재산출)
- [X] **T031** [US1] 자동 발주 도메인 서비스 — `backend/src/services/auto-order.ts`(예측-재고 차분 → 30일 평균 발주량의 3배 초과 시 `auto_hold_reason` + `pending_review` 강제, 승인된 건은 물류 어댑터로 즉시 송신 후 `sent` 전이, 전 흐름 audit). FR-006, FR-017
- [X] **T032** [P] [US1] 물류 모의 어댑터 — `backend/src/adapters/logistics/mock.ts`(CSV 응답 + 메모리 큐 + `getRecentLogisticsSends`)
- [X] **T033** [US1] 자동 발주 스케줄러 잡 — `backend/src/jobs/auto-order.ts`(30분 폴링 + open_hours_json 기반 점포별 마감-2h 트리거 + 일자별 중복 실행 방지)
- [X] **T034** [US1] `/api/stores/{storeId}/orders` 라우터 — `backend/src/routes/orders.ts` (GET list/detail, POST auto-generate, PATCH approve/cancel/update_quantity, RBAC+scope, audit)

### 프론트엔드 — 셸 & 발주 화면

- [X] **T035** [P] [US1] 프론트 인증 store + 라우터 가드 — `frontend/src/stores/auth.ts`(Pinia setup store, fetchMe/login/logout), `frontend/src/router/index.ts`(beforeEach 가드 + 401 핸들러 자동 /login)
- [X] **T036** [P] [US1] 로그인 화면 — `frontend/src/views/LoginView.vue` + `api/auth.ts` + `api/client.ts`(fetch wrapper, credentials include, 401 unified handler)
- [X] **T037** [P] [US1] AppShell 레이아웃 — `frontend/src/layouts/AppShell.vue`(상단바 + 좌측 메뉴 + 햄버거 모바일 메뉴, 768px breakpoint)
- [X] **T038** [P] [US1] Orders API 클라이언트 + Pinia store — `frontend/src/api/orders.ts`, `frontend/src/stores/orders.ts`(forecasts/orders/lastResult, refresh·generateAuto·approve·cancel)
- [X] **T039** [US1] 발주 대시보드 화면 — `frontend/src/views/OrdersView.vue`. 예측 테이블(신뢰도 색상), 대상일 선택, "자동 발주 생성", 보류 사유 토스트, 마감 카운트다운(20시), 발주 목록(상태 badge·승인·취소·상세), 모바일 반응형(640px)

**🎯 Checkpoint US1 (MVP delivery)**: 데모 점주 로그인 → OrdersView 진입 → 예측 표 확인 → 자동 발주 생성 → 정상/보류 분기 시각 확인 → 모바일 너비에서도 동일 흐름 동작. quickstart.md §5의 단계 1~3 통과.

> **M1 MVP 구현 완료 (2026-05-22)**. 검증 절차는 [US1-VERIFY.md](../../US1-VERIFY.md) 참조. 다음 단계: Phase 4 (US2, T040~T049).

---

## Phase 4: User Story 2 — 실시간 알림·점포 모니터링 (P2)

**Story Goal**: 가맹점주가 외부에서 결품·이상거래·하드웨어/통신 장애를 30초 이내 푸시 수신하고 원격으로 상세를 확인한다.

**Independent Test**: 다른 브라우저 탭에서 점주 로그인 → 시뮬레이션으로 결품 이벤트 트리거 → 알림 패널에 30초 이내 표시 + 재고 화면 유통기한 임박 필터 동작.

**관련 FR/SC**: FR-015, FR-016, FR-018 / SC-011, SC-015

### 백엔드

- [X] **T040** [P] [US2] 이벤트 디스패처 — `backend/src/services/event-dispatcher.ts` (audit() fire-and-forget 훅, severity≥warn 또는 alertable type 시 STORE_OWNER/STAFF 에 `notification` 적재 + `store:<id>`·`user:<id>` SSE 채널 push). FR-016
- [X] **T041** [P] [US2] `GET /api/stores/{storeId}/events` 라우터 — `backend/src/routes/events.ts` (event_log 조회 + notifications 목록·읽음 처리·전체 읽음)
- [X] **T042** [US2] `GET /api/stores/{storeId}/events/stream` SSE 라우터 — `backend/src/routes/events.stream.ts` (T024 EventBus, store+user 채널 동시 구독)
- [X] **T043** [P] [US2] `GET /api/stores/{storeId}/inventory` 라우터 — `backend/src/routes/inventory.ts` (nearExpiry·임계일·카테고리·lowStockThreshold 필터 + summary)
- [X] **T044** [P] [US2] `GET /api/stores/{storeId}/transactions` 라우터 — `backend/src/routes/transactions.ts` 확장 (from/to/posSource 필터 + aggregate=daily|weekly|monthly 집계)
- [X] **T045** [US2] 오프라인 로컬 보존·동기화 모듈 — `backend/src/services/local-buffer.ts` (메모리+JSONL 큐, 15초 DB ping, 복구 감지 시 자동 flush + `sync.flushed` audit, /healthz `online`·`buffered` 노출). FR-018

### 프론트엔드

- [X] **T046** [P] [US2] Events API 클라이언트 + SSE 컴포저블 — `frontend/src/api/events.ts`, `frontend/src/composables/useEventStream.ts` (지수 백오프 자동 재연결), `frontend/src/stores/events.ts` (Pinia, unreadCount + 패널 toggle)
- [X] **T047** [P] [US2] 재고 화면 — `frontend/src/views/InventoryView.vue` (summary 카드 4개, nearExpiry/일수/카테고리 필터, 행 색상: 결품=빨강·임박=주황·저재고=파랑, 768px 반응형)
- [X] **T048** [P] [US2] 거래/매출 화면 — `frontend/src/views/TransactionsView.vue` (chart.js bar+line, daily/weekly/monthly, 기간 선택, 매출/건수/객단가 메트릭, 480px 반응형)
- [X] **T049** [US2] 이벤트 패널 + AppShell 알림 배지 — `frontend/src/components/EventPanel.vue` (드로어, 알림+이벤트 분리, 읽음 처리) + AppShell 헤더(🔔 배지·실시간 연결 점·SSE 자동 연결)

**Checkpoint US2**: SSE 알림 30초 이내 표시, 오프라인 모드에서 결제 입력 후 온라인 복귀 시 자동 동기화. quickstart.md §5 단계 4~5 통과.

> **M2 구현 완료 (2026-05-22)**. 검증 절차는 [US2-VERIFY.md](../../US2-VERIFY.md) 참조. 다음 단계: Phase 5 (US3, T050~T058).

---

## Phase 5: User Story 3 — 동적 가격·타깃 마케팅 (P3)

**Story Goal**: 유통기한 임박·재고 과다·외부 환경 변화 트리거 시 동적 할인이 자동 산출되어 ESL 큐와 푸시 어댑터로 송신되고 점주가 사후 대시보드에서 결과를 확인한다.

**Independent Test**: 임박 임계 초과 재고를 시드 → 가격 룰 실행 → `pricing_event` 적재 + ESL/푸시 mock 로그 + 화면에 할인 적용 이력 표시.

**관련 FR/SC**: FR-007, FR-008, FR-009, FR-021 / SC-008

### 백엔드

- [X] **T050** [P] [US3] 가격 룰 엔진 — `backend/src/services/pricing.ts` (5종 트리거 평가 + 3종 액션, lastUnitPrice 자동 산정, pricing_event 적재 시 audit_meta_json에 ruleId·triggerContext·actionConfig 보존, ESL+Push 동시 발사, pricing.applied audit). FR-007~009, FR-021
- [X] **T051** [P] [US3] ESL 모의 어댑터 — `backend/src/adapters/esl/mock.ts` (메모리 큐 + 1초 후 'sent' 모사 + `esl.queued` audit + `getEslQueueSnapshot`)
- [X] **T052** [P] [US3] 푸시 모의 어댑터 — `backend/src/adapters/push/mock.ts` (콘솔 로그 + notification 'push' 채널로 DB 적재 + `getRecentPushSends`)
- [X] **T053** [P] [US3] `/api/pricing/rules` CRUD 라우터 — `backend/src/routes/pricing.ts` (GET·POST·PATCH·DELETE + POST /:id/evaluate 수동 평가, zod 검증, STORE_OWNER/HQ_OPERATOR 권한)
- [X] **T054** [US3] `GET /api/stores/{storeId}/pricing-events` 라우터 — 동일 파일 (룰·상품 조인 + ESL 상태 + audit_meta 포함)
- [X] **T055** [US3] 가격 트리거 스케줄러 — `backend/src/jobs/pricing-trigger.ts` (15분 주기 evaluateAllActive, `pricing.batch_run` audit, manual 트리거 제외)

### 프론트엔드

- [X] **T056** [P] [US3] Pricing API 클라이언트 + store — `frontend/src/api/pricing.ts`, `frontend/src/stores/pricing.ts` (rules/events/evaluate, lastEvaluation 토스트)
- [X] **T057** [P] [US3] 가격 룰 관리 화면 — `frontend/src/views/PricingRulesView.vue` (CRUD + 트리거/액션 동적 프리셋 JSON 편집기 + "평가" 버튼 즉시 실행)
- [X] **T058** [US3] 가격 적용 이력 화면 — `frontend/src/views/PricingEventsView.vue` (원가→할인가, 할인% 배지, 유효기간, ESL 상태 색상, 가로 스크롤 반응형)

**Checkpoint US3**: 임박 재고 시드 → 룰 실행 후 ESL/푸시 큐에 메시지 적재 + 화면에 이력 표시.

> **M3 구현 완료 (2026-05-22)**. 검증 절차는 [US3-VERIFY.md](../../US3-VERIFY.md) 참조. 다음 단계: Phase 6 (US4, T059~T062).

---

## Phase 6: User Story 4 — 운영 성과 리포트 (P4)

**Story Goal**: 시범 매장의 4주 운영 데이터로 폐기율·매출·인건비·MAPE를 자동 집계·리포트하여 SC-001~010 달성도를 가시화.

**Independent Test**: 시드 거래 + 폐기 이벤트 후 일간 집계 잡 실행 → `performance_kpi_daily` 생성 → 리포트 화면에서 점포·기간 비교 차트 노출.

**관련 FR/SC**: FR-022 / SC-001, SC-002, SC-008, SC-009, SC-013

### 백엔드

- [X] **T059** [P] [US4] KPI 집계 잡 — `backend/src/services/kpi.ts` + `backend/src/jobs/kpi-aggregate.ts` (시간 폴링, 00~01시면 어제 1회 집계 + 매 시간 오늘 부분 집계, performance_kpi_daily upsert, revenue/cnt/avgTicket/discardAmount/discardRate/MAPE 산출, kpi.aggregated audit)
- [X] **T060** [US4] `GET /api/stores/{storeId}/reports/daily` 라우터 — `backend/src/routes/reports.ts` (기간 조회 + 합계/평균 summary + 비교 가능한 series + POST /backfill 멱등 재집계)

### 프론트엔드

- [X] **T061** [P] [US4] Reports API 클라이언트 + store — `frontend/src/api/reports.ts`, `frontend/src/stores/reports.ts` (current/compare 동시 관리 + backfill)
- [X] **T062** [US4] 리포트 화면 — `frontend/src/views/ReportsView.vue` (5개 메트릭 카드 + 매출·거래수 듀얼축 차트 + 폐기율 라인 + MAPE 라인, 기간 비교 토글 시 점선 데이터셋, 일별 상세 표, 1024/640px 반응형, "재집계" 버튼)

**Checkpoint US4**: quickstart.md §5 단계 7 통과 — 점주가 일간 리포트로 SC 지표 확인 가능.

> **M4 구현 완료 (2026-05-22)**. 검증 절차는 [US4-VERIFY.md](../../US4-VERIFY.md) 참조. 다음 단계: Phase 7 (US5, T063~T065).

---

## Phase 7: User Story 5 — 셀프 결제·Vision 모의 (P5)

**Story Goal**: 셀프 결제·앱 결제 거래가 정상 적재되고, AI 카메라가 수집한 비식별 동선 데이터가 `analytics_customer_behavior`에 기록된다. 1차는 모의 어댑터만.

**Independent Test**: 셀프 결제 모의 화면에서 스캔 → 거래 즉시 생성 + 재고 차감, Vision mock 재생 → 동선 이벤트 적재.

**관련 FR/SC**: FR-011, FR-012, FR-020 / SC-005, SC-007

- [X] **T063** [P] [US5] Vision 모의 어댑터 — `backend/src/adapters/vision/mock.ts` (8단계 사전녹화 시나리오 5초 주기 재생, 세션 ID 회전, `analytics_customer_behavior` 직접 적재, vision.capture_started/stopped audit, PII 미수집) + `backend/src/routes/vision.ts` (start/stop/status + analytics behavior·zones 집계 라우터)
- [X] **T064** [P] [US5] `transactions/ingest` 확장 — 기존 라우터가 `pos_source=self_kiosk|app` 모두 지원(zod enum)·재고 자동 차감(adapters/pos/mock.ts inventory_history 트리거) 이미 충족. 셀프 결제용 상품 검색 라우터 추가 — `backend/src/routes/products.ts` (`GET /products/lookup?q=` 바코드/local_code/이름 매칭)
- [X] **T065** [US5] 셀프 결제 모의 화면 — `frontend/src/views/SelfCheckoutMockView.vue` (바코드 입력+자주 쓰는 상품 단축 버튼, 장바구니 수량 조정, 모바일/카드 결제 버튼 → `pos_source=self_kiosk` ingest, Vision Mock 시작/정지 토글, 존별 활동·최근 행동 이벤트 패널, 900px 반응형)

**Checkpoint US5**: quickstart.md §5 단계 6 통과.

> **M5 구현 완료 (2026-05-22)**. 검증 절차는 [US5-VERIFY.md](../../US5-VERIFY.md) 참조. 다음 단계: Phase 8 Polish (T066~T079).

---

## Phase 8: Polish & Cross-Cutting (마감)

> 보안·감사·CI·배포 등 횡단 관심사. 스토리 진행과 무관하게 병렬 가능한 항목은 [P].

### 보안·컴플라이언스

- [X] **T066** [P] PII 접근 가드 미들웨어 — `backend/src/middleware/pii-guard.ts` (`requirePiiAccessAudited(resource)` — SUPER_ADMIN/HQ_OPERATOR만 통과, 통과/거부 모두 `pii.access_granted`/`pii.access_denied` audit)
- [X] **T067** [P] 상품 매핑 검토 화면 — `frontend/src/views/ProductMappingsView.vue` + `backend/src/routes/mappings.ts` (GET 필터, PATCH confirm/reject/reassign, POST /auto-rerun)
- [X] **T068** [P] 감사 보존 정책 — `db/migrations/009_event_log_partition.sql` (FK 분리 → RANGE TO_DAYS 월별 파티션 13개 + p_future, 1년 단위 DROP PARTITION 회수 가능)
- [X] **T069** [P] 앱 사용자 동의 관리 라우터 — `backend/src/routes/consent.ts` (GET 동의 목록, POST grant/revoke, GET /audit 본인 접근 이력, `requirePiiAccessAudited` 적용)

### API·문서·테스트

- [X] **T070** [P] RFC 7807 에러 미들웨어 — `backend/src/middleware/problem.ts` (`HttpProblem` 클래스 + `notFound/badRequest/forbidden` 헬퍼, application/problem+json 일관 응답)
- [X] **T071** [P] OpenAPI 정적 노출 — `backend/src/routes/docs.ts` (swagger-ui-express + js-yaml, `/api/docs` UI + `/api/docs.json`, 운영 환경 제외)
- [X] **T072** [P] Vitest 컴포넌트 테스트 골격 — `frontend/src/__tests__/{auth.store, orders.store, LoginView}.test.ts` (vi.mock + @vue/test-utils mount)
- [X] **T073** [P] Jest/Supertest 통합 테스트 골격 — `backend/tests/routes.smoke.test.ts` (health/ready/protected 401·zod 400·docs.json 검증)

### 배포·운영

- [X] **T074** [P] Docker 풀스택 빌드 — `docker/Dockerfile.{backend,frontend}` 멀티스테이지(deps→build→runtime), nginx:alpine 정적 호스팅, HEALTHCHECK, USER node, `.dockerignore`
- [X] **T075** [P] Nginx 리버스 프록시 설정 — `docker/nginx/default.conf` (server_name p12.sumzip.com, SSE 위치 `proxy_buffering off` + 1h timeout, keepalive upstream, gzip, /api/docs 별도 location)
- [X] **T076** [P] GitLab CI 파이프라인 — `.gitlab-ci.yml` 단계 6종 (secret-scan→lint→test→build→docker→deploy), test 아티팩트 junit/coverage, docker push :latest+:SHA, staging URL = p12.sumzip.com
- [X] **T077** [P] `.env` 평문 노출 점검 스크립트 — `scripts/check-secrets.sh` (트래킹된 .env 차단 + 시크릿 패턴 6종 + .env.example 값 비어있음 검증, CI secret-scan 단계에서 실행)

### 부가

- [X] **T078** [P] vue-i18n 골격 — `frontend/src/i18n.ts` + `locales/{ko,en}.json` (네비/인증/공통 키, navigator.language 기반 자동 선택, ko fallback)
- [X] **T079** [P] 헬스체크·메트릭 — `/api/healthz`(online/buffered) + `/api/readyz` + `/api/metrics`(DB ok, 사용자/점포/발주/에러/알림 카운트, 메모리, uptime) + production은 pino → file 회전

> **✅ ALL PHASES 완료 (2026-05-22)**. 최종 검증·체크리스트는 [FINAL-VERIFY.md](../../FINAL-VERIFY.md) 참조.

---

## Dependencies (사용자 스토리 완료 순서)

```
Setup (T001–T006)
  └─→ Foundational (T007–T024)
        ├─→ US1 (T025–T039)  🎯 MVP 단독 배포 가능
        ├─→ US2 (T040–T049)   ← T024(SSE) 의존
        ├─→ US3 (T050–T058)   ← T022(adapter ports) 의존
        ├─→ US4 (T059–T062)   ← US1 거래·발주 누적 데이터 의존
        └─→ US5 (T063–T065)   ← T026 transactions/ingest 의존
              ↓
        Polish (T066–T079)   ← 모든 스토리와 병행 가능, 마지막 검수
```

- **US1 단독으로도 MVP 배포 가능**(예측+자동 발주 end-to-end). 이후 US2~US5는 **독립적으로 증분 출시** 가능.
- 동일 파일(`backend/src/routes/transactions.ts`, `events.ts`, `pricing.ts`, AppShell.vue 등) 작업은 [P] 없음(순차).

---

## Parallel Execution Examples (스토리별 병렬 묶음)

### Foundational 단계 (모두 [P])
```
T009  T010  T011  T012  T013  T014  T015  T016   # 마이그레이션 8개 동시
T022  T023  T024                                  # 어댑터 인프라 3개
```

### US1 병렬 묶음
```
T025(POS mock)  T027(weather)  T028(매핑)  T029(forecast)  T032(logistics)
T035(auth store) T036(LoginView) T037(AppShell) T038(orders client/store)
```
→ T030, T031, T033, T034, T039는 위 산출물에 의존해 순차.

### US2 병렬 묶음
```
T040(dispatcher)  T041(events GET)  T043(inventory)  T044(transactions GET)
T046(SSE composable)  T047(InventoryView)  T048(TransactionsView)
```

### Polish 단계
```
T066  T067  T068  T069  T070  T071  T072  T073  T074  T075  T076  T077  T078  T079
```
→ 모두 독립 파일이므로 [P] 가능.

---

## Implementation Strategy (점진적 전달)

| 마일스톤 | 포함 | 산출 | SC 목표 |
|---------|------|------|--------|
| **M0 — Boot** | Setup + Foundational(T001~T024) | 로그인·DB·SSE·어댑터 골격 | — |
| **M1 — MVP 🎯** | + US1(T025~T039) | 자동 발주 end-to-end (수직 슬라이스) | SC-002 (MAPE 30% 개선 검증 시작) |
| **M2 — 실시간** | + US2(T040~T049) | 30초 알림·모바일 모니터링 | SC-011, SC-015 |
| **M3 — 수익화** | + US3(T050~T058) | 동적 가격·푸시 | SC-001, SC-008 |
| **M4 — 측정** | + US4(T059~T062) | 운영 성과 리포트 | SC-001~010 정량 검증 |
| **M5 — 옵션** | + US5(T063~T065) | 셀프 결제·Vision 모의 | SC-005, SC-007 |
| **M6 — 운영** | + Polish(T066~T079) | 보안·감사·CI·문서 | SC-013, SC-014 |

> **권장**: M1 완료 시점에 시범 매장 1곳에 부분 배포 → 4주 데이터 누적 후 M2~M4 순차 릴리스.

---

## Task Coverage Summary

| 분류 | 작업 수 |
|------|--------|
| Phase 1 Setup | 6 (T001~T006) |
| Phase 2 Foundational | 18 (T007~T024) |
| Phase 3 US1 (MVP) | 15 (T025~T039) |
| Phase 4 US2 | 10 (T040~T049) |
| Phase 5 US3 | 9 (T050~T058) |
| Phase 6 US4 | 4 (T059~T062) |
| Phase 7 US5 | 3 (T063~T065) |
| Phase 8 Polish | 14 (T066~T079) |
| **합계** | **79** |

| 스토리 | Independent Test 기준 |
|-------|----------------------|
| **US1** | 점주 로그인 → 예측 확인 → 자동 발주 생성 → 정상/보류 분기 확인 → 모바일 너비 동작 |
| **US2** | 결품 이벤트 트리거 후 30초 이내 알림 표시 + 오프라인 복귀 시 자동 동기화 |
| **US3** | 임박 재고 시드 → 가격 룰 실행 → ESL/푸시 큐 적재 + 화면 이력 |
| **US4** | KPI 집계 잡 실행 후 리포트 화면 차트 노출 |
| **US5** | 셀프 결제 스캔 → 거래 생성 + Vision mock 동선 적재 |

---

## Suggested MVP Scope

**Phase 1 + 2 + 3 (US1) = 39 작업으로 MVP 완성** — 가맹점주의 핵심 가치(자동 발주 모니터링) 단독 배포 가능. spec.md의 Primary User Story와 SC-002·SC-013 1차 충족.

---

## 다음 단계

- 학기·인력 일정에 맞춰 마일스톤별 스프린트 분할
- `/speckit.implement`로 본 tasks.md를 순차 실행
- plan.md Open Questions(시범 매장 수·SLA·모바일 앱 범위)는 M1 완료 후 `/speckit.clarify` 재확인
