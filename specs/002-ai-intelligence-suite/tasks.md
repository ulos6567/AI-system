# Tasks: AI 인텔리전스·처방형 운영 인사이트

**Feature**: 002-ai-intelligence-suite
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data Model**: [data-model.md](./data-model.md) · **Contracts**: [contracts/api.yaml](./contracts/api.yaml)
**Base**: 001-ai-store-ops (기존 코드베이스 증분)

> 규약: `[P]` = 서로 다른 파일이라 병렬 가능. 같은 파일 수정은 순차. 스토리 라벨 `US1~US7`. 각 스토리는 독립 검증 가능한 증분.
> 우선순위는 spec.md Acceptance Scenario와 plan의 수직 슬라이스 전략에서 도출: **P1=처방 루프(MVP)**, P2=대시보드·이상감지·AI비서, P3=히트맵·예지보전·스케줄러.

---

## Phase 1: Setup (공유 인프라)

- [X] **T001** `.env` / `.env.example`에 LLM 변수 추가(`LLM_API_KEY`, `LLM_API_BASE`, `LLM_MODEL`) — 평문 커밋 금지, `.gitignore` 확인. (backend/.env.example)
- [X] **T002** [P] 신규 의존성 검토·설치(필요 시 LLM SDK/HTTP 클라이언트) (backend/package.json)
- [X] **T003** [P] 프론트 라우터에 신규 화면 라우트 placeholder 등록 (frontend/src/router/index.ts)

**Checkpoint**: 환경 변수·라우트 골격 준비 완료.

---

## Phase 2: Foundational (모든 스토리의 선행 조건 — 차단성)

- [X] **T004** DB 마이그레이션: 002 신규 테이블 생성 — `operational_signal`, `prescriptive_action`, `action_outcome`, `behavior_insight`, `anomaly_event`, `device`, `device_reading`, `maintenance_alert`, `assistant_conversation`, `assistant_message`, `employee`, `work_schedule`, `work_shift`, `product_media` + 인덱스 (backend/src/db/migrate.ts)
- [X] **T005** [P] `event_log`에 신규 `event_type` 값 추가/허용 (action_approved/executed/rejected, assistant_query, anomaly_notified/feedback, maintenance_alert, schedule_confirmed) (backend/src/db/migrate.ts 또는 lib)
- [X] **T006** [P] 포트 인터페이스 정의: `anomaly.ts`, `iot.ts`, `llm.ts` (backend/src/ports/)
- [X] **T007** 어댑터 팩토리 확장: 신규 포트(anomaly/iot/llm) 등록·env 기반 선택 (backend/src/adapters/factory.ts)
- [X] **T008** [P] RBAC 재사용 확인: 신규 라우트용 역할 매핑 정의(점주/HQ/직원) (backend/src/middleware/rbac.ts)

**Checkpoint**: 스키마·포트·권한 기반 준비 → 사용자 스토리 착수 가능.

---

## Phase 3: US1 — 처방형 액션 루프 (P1, MVP) 🎯

**목표**: 신호 탐지 → 처방 카드 → 점주 승인 실행 → 효과 자동 검증 (Scenario 1·2, FR-001~006)
**독립 검증**: 데모 데이터에서 처방 카드가 우선순위로 표시되고, '실행' 시 001 가격/발주가 적용되며, 검증 기간 후 예상 대비 실제 리포트가 생성된다.

- [X] **T009** [P][US1] 신호 탐지 서비스: 매출감소/폐기위험/수요급증 룰 → `operational_signal` 생성 (backend/src/services/signal-detect.ts)
- [X] **T010** [US1] 처방 생성 서비스: 신호→처방(대상·조정폭·시점·예상효과·근거·priority), `status='proposed'` (backend/src/services/prescription.ts)
- [X] **T011** [US1] 처방 승인·실행: `approve`는 001 `pricing.ts`/`auto-order.ts` 호출 후 `executed`, `reject`는 사유 기록 — **자동 실행 경로 없음** (backend/src/services/prescription.ts)
- [X] **T012** [US1] 효과 검증: 실행 시 베이스라인 스냅샷 저장 + 검증 잡 (backend/src/services/prescription.ts, backend/src/jobs/action-verify.ts)
- [X] **T013** [US1] 신호 탐지·처방 생성 주기 잡 (backend/src/jobs/signal-detect.ts)
- [X] **T014** [US1] 라우트: `/api/insights/signals`, `/api/insights/actions`, `/actions/{id}/approve|reject`, `/actions/{id}/outcome` (backend/src/routes/insights.ts) + index 마운트
- [X] **T015** [US1] 감사: 승인/실행/거절 시 `event_log` 기록 (FR-027) (backend/src/services/prescription.ts)
- [X] **T016** [P][US1] 통합 테스트: `proposed→approve→executed`, `proposed→reject`, 자동 실행 부재 검증 (backend/tests/insights.test.ts)
- [X] **T017** [P][US1] 프론트: 처방 액션 카드 화면(우선순위 정렬, 실행/수정/거절, 근거 표시) (frontend/src/views/InsightsView.vue + store + api)
- [X] **T018** [P][US1] 프론트: 처방 효과 검증 결과 표시 (frontend/src/views/InsightsView.vue)

**Checkpoint**: MVP 완성 — 처방 루프 end-to-end 독립 동작.

---

## Phase 4: US2 — 데이터 대시보드·상품 이미지 (P2)

**목표**: 풍부한 시각화 + 실제 상품 이미지 100% (Scenario 3, FR-007~010, SC-008/009)
**독립 검증**: 기간·점포·카테고리 필터로 차트·KPI가 3초 내 표출, 데모에서 빈 화면 0건, 상품 이미지/대체 이미지 100%.

- [X] **T019** [P][US2] 상품 미디어 서비스 + 대체 이미지(fallback) 리졸버 (backend/src/services/product-media.ts 또는 기존 product 서비스 확장)
- [X] **T020** [US2] 라우트: `/api/products/{id}/media` (backend/src/routes/products.ts 확장)
- [X] **T021** [P][US2] 데모 시드 확장: `product_media`(실제/대체) 및 대시보드용 집계 데이터 충전 — 날짜 상대 생성 (backend/src/db/seed-demo-refresh.ts)
- [X] **T022** [P][US2] 프론트: 대시보드(차트·KPI 카드, 기간/점포/카테고리 필터) (frontend/src/views/HomeView.vue 확장 또는 신규)
- [X] **T023** [P][US2] 프론트: 상품 이미지 컴포넌트(실제 우선, 없으면 대체) 전 화면 적용 (frontend/src/components/)

**Checkpoint**: 대시보드·이미지 표출, 빈 화면 0건.

---

## Phase 5: US3 — 이상 징후 감지·알림 (P2)

**목표**: 이상 행동 감지 → 30초 내 알림 → 오탐 피드백 (Scenario 5, FR-014~016, SC-005/006)
**독립 검증**: 시뮬레이터가 이상 이벤트를 주입하면 30초 내 SSE/푸시 알림이 도달하고, 목록·오탐 피드백·관제 전파 설정이 동작한다.

- [X] **T024** [P][US3] 이상 시뮬레이션 어댑터(미결제/소란/쓰러짐/침입 생성) (backend/src/adapters/anomaly/)
- [X] **T025** [US3] 이상 서비스: 이벤트 수신·저장·알림(기존 push/SSE 재사용)·관제 전파 훅 (backend/src/services/anomaly.ts)
- [X] **T026** [US3] 시뮬레이터 잡: 주기적 이상 이벤트 주입 (backend/src/jobs/anomaly-sim.ts)
- [X] **T027** [US3] 라우트: `/api/anomalies`, `/anomalies/{id}/feedback` + 감사 기록 (backend/src/routes/anomalies.ts)
- [X] **T028** [P][US3] 통합 테스트: 알림 SLA(≤30초)·오탐 피드백 반영 (backend/tests/anomalies.test.ts)
- [X] **T029** [P][US3] 프론트: 이상 이벤트 목록·실시간 알림·오탐 표시 (frontend/src/views/AnomaliesView.vue + store)

**Checkpoint**: 이상 감지·알림 독립 동작.

---

## Phase 6: US4 — AI 경영비서 (P2, 외부 LLM)

**목표**: 자연어 질의 → 근거 동반 응답, 근거 없으면 "데이터 없음" (Scenario 7, FR-019~021, SC-010)
**독립 검증**: 대표 질의("오늘 최다 판매?", "내일 샌드위치 발주량?", "이번 달 마진?")에 근거 출처와 함께 답하고, 환각 폴백이 동작한다.

- [X] **T030** [P][US4] LLM 어댑터: 외부 LLM API 호출(키 `.env`) (backend/src/adapters/llm/)
- [X] **T031** [US4] 비서 서비스(RAG): 의도 분류 → 데이터 조회 → 비식별 컨텍스트 → LLM 호출 → 근거 동반/폴백 (backend/src/services/assistant.ts)
- [X] **T032** [US4] 라우트: `/api/assistant/conversations`, `/conversations/{id}/messages` + 감사(assistant_query) (backend/src/routes/assistant.ts)
- [X] **T033** [P][US4] 통합 테스트: 근거 동반율·환각 폴백("데이터 없음")·개인식별자 미전송 (backend/tests/assistant.test.ts)
- [X] **T034** [P][US4] 프론트: AI 비서 챗 화면(근거 출처 표시, 처방 연결) (frontend/src/views/AssistantView.vue + store)

**Checkpoint**: AI 비서 독립 동작.

---

## Phase 7: US5 — Vision 히트맵·행동 분석 (P3, 시뮬레이션)

**목표**: 매대 히트맵·비식별 행동 통계·배치 개선 제안 (Scenario 4, FR-011~013, SC-007)
**독립 검증**: 분석 화면에서 히트맵과 관심 행동 통계가 표출되고 배치 개선 제안이 제공된다(비식별만).

- [X] **T035** [P][US5] Vision 어댑터 확장: 시뮬레이션 동선/행동 이벤트 → 집계 (backend/src/adapters/vision/)
- [X] **T036** [US5] 분석 서비스: `behavior_insight` 집계(체류 가중치·관심 행동·추정 세그먼트) + 배치 개선 제안 (backend/src/services/analytics.ts)
- [X] **T037** [US5] 라우트: `/api/analytics/heatmap`, `/api/analytics/behavior` (backend/src/routes/analytics.ts)
- [X] **T038** [P][US5] 통합 테스트: 비식별 보장(개인식별자 부재) (backend/tests/analytics.test.ts)
- [X] **T039** [P][US5] 프론트: 히트맵 그리드·행동 통계·개선 제안 (frontend/src/views/AnalyticsView.vue + store)

**Checkpoint**: 히트맵·행동 분석 독립 동작.

---

## Phase 8: US6 — IoT 예지보전 (P3, 시뮬레이션)

**목표**: 장비 온도·전력 모니터링 → 고장 사전 경고, 임계 위험 격상 (Scenario 6, FR-017~018, SC-004)
**독립 검증**: 시뮬레이션 센서가 이상 추세를 보이면 예지보전 경고가 생성되고 임계 위험은 즉시 알림으로 격상된다.

- [X] **T040** [P][US6] IoT 시뮬레이션 어댑터: 센서 스트림(온도·전력) 생성 (backend/src/adapters/iot/)
- [X] **T041** [US6] 예지보전 서비스: 임계/추세 룰 → `maintenance_alert`, 위험 격상 (backend/src/services/device-health.ts)
- [X] **T042** [US6] 장비 모니터링 잡 (backend/src/jobs/device-monitor.ts)
- [X] **T043** [US6] 라우트: `/api/devices`, `/devices/{id}/health` + 감사 (backend/src/routes/devices.ts)
- [X] **T044** [P][US6] 프론트: 장비 상태·예지보전 경고 화면 (frontend/src/views/DevicesView.vue + store)

**Checkpoint**: 예지보전 독립 동작.

---

## Phase 9: US7 — 인력 최적화 스케줄러 (P3)

**목표**: 수요 기반 시프트 초안 자동 생성, 법정 제약 반영·위반 명시, 확정 시 예상 인건비 (Scenario 8, FR-022~024, SC-011)
**독립 검증**: 스케줄 생성 시 시프트 초안과 예상 인건비가 표시되고, 제약 위반 시 항목이 명시되며 확정/수정이 가능하다.

- [X] **T045** [P][US7] 스케줄러 서비스: 수요(001 forecast)→필요 인원→가용성·법정 제약 그리디 배정, 위반 명시 (backend/src/services/scheduler.ts)
- [X] **T046** [US7] 라우트: `/api/schedules/generate`, `/schedules/{id}/confirm` + 감사(schedule_confirmed) (backend/src/routes/schedules.ts)
- [X] **T047** [P][US7] 통합 테스트: 제약 100% 준수 또는 위반 명시 (backend/tests/schedules.test.ts)
- [X] **T048** [P][US7] 프론트: 스케줄 생성·수정·확정·예상 인건비 화면 (frontend/src/views/ScheduleView.vue + store)

**Checkpoint**: 스케줄러 독립 동작.

---

## Phase 10: Polish & Cross-Cutting

- [X] **T049** [P] 신규 화면 AppShell 네비게이션·i18n(ko/en) 항목 추가 (frontend/src/layouts/AppShell.vue, locales/*.json)
- [X] **T050** [P] 데모 시드 통합 검증: 전 화면 빈 화면 0건·이미지 100% (SC-008/009) (backend/src/db/seed-demo-refresh.ts) — 직원(employee) 시드 추가, 스케줄러 데이터 보장
- [X] **T051** [P] 감사 일관성 점검: 처방/AI/이상/스케줄 이벤트 100% 보존 (SC-012) (backend/tests/audit.test.ts)
- [X] **T052** [P] quickstart.md 검증 절차대로 수동 E2E 점검 및 문서 업데이트 — `/schedule` 검증 절차 반영 완료
- [X] **T053** OpenAPI(api.yaml) ↔ 실제 라우트 정합성 점검 — 스케줄 generate/confirm 일치 + list/get 슈퍼셋, store-scoped 마운트 규약 일관

---

## Dependencies (스토리 완료 순서)

```
Setup (T001-T003)
  └─> Foundational (T004-T008)   ← 모든 스토리 차단
        ├─> US1 (T009-T018)  P1 · MVP
        ├─> US2 (T019-T023)  P2   (Foundational 후 독립)
        ├─> US3 (T024-T029)  P2   (push/SSE 재사용)
        ├─> US4 (T030-T034)  P2   (llm 포트)
        ├─> US5 (T035-T039)  P3
        ├─> US6 (T040-T044)  P3
        └─> US7 (T045-T048)  P3
              └─> Polish (T049-T053)  ← 모든 스토리 후
```

- US1~US7은 Foundational 완료 후 **상호 독립** — 병렬 팀 작업 가능.
- US1의 처방 실행(T011)은 001 `pricing`/`auto-order`에 의존(이미 존재).
- US7(T045)은 001 forecast에 의존(이미 존재).

---

## Parallel Execution Examples

- **Foundational 내부**: T005, T006, T008 동시 (T004 마이그레이션과 파일 분리 시).
- **US1 내부**: 백엔드(T009~T015) 진행 중 프론트(T017·T018)·테스트(T016) 병렬.
- **스토리 간**: Foundational 완료 후 US1·US2·US3·US4를 서로 다른 담당자가 병렬 진행.

---

## Implementation Strategy

1. **MVP = US1**(처방 루프). 여기까지가 본 기능의 핵심 가치(분석→처방→승인→검증).
2. 이후 가치·시연 효과 순으로 US2(대시보드)→US3(이상)→US4(비서) 증분.
3. P3(US5 히트맵·US6 예지보전·US7 스케줄러)는 시연 보강·후속.
4. 각 스토리 완료 시 Checkpoint에서 독립 검증 → 안전하게 머지.

---

## 요약

| 구분 | 작업 수 |
|------|--------|
| Setup | 3 (T001-T003) |
| Foundational | 5 (T004-T008) |
| US1 처방 루프 (P1·MVP) | 10 (T009-T018) |
| US2 대시보드·이미지 (P2) | 5 (T019-T023) |
| US3 이상 감지 (P2) | 6 (T024-T029) |
| US4 AI 비서 (P2) | 5 (T030-T034) |
| US5 히트맵 (P3) | 5 (T035-T039) |
| US6 예지보전 (P3) | 5 (T040-T044) |
| US7 스케줄러 (P3) | 4 (T045-T048) |
| Polish | 5 (T049-T053) |
| **합계** | **53** |
