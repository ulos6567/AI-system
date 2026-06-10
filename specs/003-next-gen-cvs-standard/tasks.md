# Tasks: 차세대 편의점 표준 모델 — 통합·완성 계층

**Feature**: `003-next-gen-cvs-standard`
**Plan**: [plan.md](./plan.md)
**Base**: 001-ai-store-ops + 002-ai-intelligence-suite (기존 모듈 재사용/확장)
**Created**: 2026-06-10
**Input**: plan.md (spec.md 생략 — 비전 문서 직접 기반). 유저 스토리는 plan의 통합 영역·SC-001~007에서 도출.

> **테스트 포함 사유**: plan.md Phase 2 분해 원칙이 "거버넌스 동반 통합 테스트", "SC 각각 측정·검증 태스크 동반"을 명시하므로 통합/검증 테스트 태스크를 포함한다.

---

## 유저 스토리 (plan 도출)

| ID | 우선순위 | 스토리 | 관련 SC |
|----|---------|--------|---------|
| US1 | **P1** | 점주/본사가 점포별 제각각인 상품 코드를 표준 코드로 통일해 AI 입력 품질을 확보한다 | SC-006 |
| US2 | **P1** | 고객이 매장에서 대기 없이 셀프 결제하고, 대기시간이 계측된다 | SC-004 |
| US3 | **P2** | 통신·서버 장애 시에도 결제가 끊기지 않고(오프라인 백업) 복구 시 안전하게 동기화된다 | SC-005 |
| US4 | **P2** | 외부 데이터(날씨·상권·유동인구)가 표준 입력으로 수집되어 수요예측 품질을 높인다 | SC-001/003 |
| US5 | **P3** | 점주가 비전 KPI(폐기율·객단가·예측·대기·가동률)를 한 화면에서 본다 | SC-001~007 |

거버넌스(비식별·동의, SC-007)는 특정 스토리가 아닌 **횡단 게이트** → Foundational + Polish에 배치.

---

## ⚠️ 재정합 — 실제 작업 범위 (2026-06-10, 코드 점검 후)

구현 코드 점검 결과 대부분이 **이미 001/002에 존재**한다. 아래 태스크 대다수는 **재사용(코드 작성 불필요)**이며, **진짜 신규 작업은 2건**이다. spec.md §기존 구현과의 재정합 참조.

| 태스크군 | 판정 | 비고 |
|---|---|---|
| T004 신규 테이블 6종 | **대폭 축소** | `checkout_metric`만 신규. 나머지는 기존 테이블 재사용 → 신규 마이그레이션 1개(=checkout_metric)만 |
| US1 T009~T013 (표준화) | **재사용** | `product-mapping.ts`/`mappings.ts` 이미 구현 |
| **T011a (커버리지 리포트)** | **🆕 신규** | SC-006 — 기존 미존재. 본 구현 추가 |
| US2 T015~T019 (셀프결제) | 부분 | 결제 자체는 기존, **T016a 대기시간 계측(checkout_metric)** 신규 |
| US3 (오프라인) | **재사용** | `local-buffer.ts`(JSONL) 그대로 |
| US4 (외부데이터) | **재사용/확장** | 날씨=`signal` 포트 기존. 상권·유동인구는 동일 포트 확장(시뮬) |
| US5 (KPI) | **확장** | `kpi.ts`에 매출·폐기율·정확도 존재. 통합 노출만 보강 |
| 거버넌스 | **재사용** | `consent.ts`/`pii-guard.ts` |

**이번 implement에서 실제 코드 작성**: ✅ **T011a 매핑 커버리지 리포트(SC-006)** — 무충돌·순수 추가. (T016a 대기시간 계측은 신규 마이그레이션 필요 → 후속.)

---

## Phase 1: Setup (공유 인프라)

- [ ] **T001** `003-next-gen-cvs-standard` 브랜치 생성 및 체크아웃(`git checkout -b 003-next-gen-cvs-standard`)
- [ ] **T002** 신규 환경변수 스캐폴딩 — `.env.example`에 외부 데이터 어댑터 토글(`EXTERNAL_DATA_MODE=sim`), 오프라인 버퍼 설정(`OFFLINE_BUFFER_ENABLED`, `HEALTHCHECK_INTERVAL_MS`) 추가
- [ ] **T003** [P] 003 작업용 통합 테스트 디렉터리·픽스처 골격 생성(`backend/test/003/`), 시드 데이터 로더 확인

---

## Phase 2: Foundational (모든 스토리의 선행 차단 조건)

> 이 단계 완료 전에는 어떤 유저 스토리도 시작 불가.

- [X] **T004 (재정합 축소)** DB 마이그레이션 — 실제 구조는 `db/migrations/*.sql`. 재정합 결과 신규 테이블은 **`checkout_metric` 1종만** 필요 → `db/migrations/015_checkout_metric.sql` 추가·적용 완료. (standard_product·product_code_mapping·offline_payment_buffer·external_signal·kpi_snapshot은 기존 테이블 재사용)
- [ ] **T005** [P] 마이그레이션 롤포워드/검증 — 신규 테이블 생성·인덱스(멱등키 unique, 표준코드 unique) 적용 확인
- [ ] **T006** 거버넌스 게이트 미들웨어 — `backend/src/middleware/` 에 `consent-gate`(데이터/결제 경로 진입 전 `consent` 검사) 추가, `services/consent.ts` 확장
- [ ] **T007** [P] 외부 데이터 표준 입력 포트 정의 — `backend/src/ports/external-data.ts`(weather·trade-area·foot-traffic 인터페이스)
- [ ] **T008** [P] KPI 집계 기반 확장 — `services/kpi.ts`에 SC-001~007 집계 함수 시그니처 정의(빈 구현 + 단위 스텁)

**Checkpoint**: 스키마·게이트·포트·KPI 시그니처 준비 완료 → 유저 스토리 착수 가능

---

## Phase 3: US1 — 상품 코드 표준화 (P1) 🎯 MVP

**목표**: 점포 원시 상품코드 → 표준코드 매핑, 미매핑 명시·커버리지 리포트(SC-006).
**독립 검증**: 시드 점포 데이터로 매핑 커버리지 ≥95% 산출, 미매핑 항목이 리포트에 명시되는지 확인.

- [ ] **T009** [P] [US1] `services/product-mapping.ts` 확장 — **규칙 기반 매핑(완전일치 → 정규화 규칙: 공백·대소문자·전각/반각 정규화 후 일치)**, 미적중은 추정 금지하고 `unmapped`/`review`로 명시. (ML 매핑 미사용, research §R1)
- [ ] **T010** [P] [US1] `standard_product` 시드/마스터 로더 추가(`backend/src/db/` 또는 seed)
- [X] **T011 (커버리지 부분)** [US1] `routes/mappings.ts`에 `GET /api/stores/:storeId/product-mappings/coverage` 추가 + `services/product-mapping.ts`에 `getMappingCoverage()` 추가 (FR-003, SC-006). ✅ 구현·타입체크 통과. (등록/수정·조회는 기존 `mappings.ts` 재사용)
- [ ] **T012** [P] [US1] `contracts/api.yaml`에 표준화 엔드포인트 3종 추가
- [ ] **T013** [P] [US1] 프론트 `frontend/src/views/MappingView.vue` — 매핑 관리·커버리지 표시, `stores`/`api` 래퍼 추가
- [ ] **T014** [US1] 통합 테스트 — 커버리지 ≥95% 계산·미매핑 명시 검증(SC-006)

**Checkpoint**: US1 단독으로 표준화·리포트 동작 → MVP 데모 가능

---

## Phase 4: US2 — 무대기 셀프 결제 (P1)

**목표**: 고객 셀프 결제 흐름 완성 + 대기시간 계측(SC-004, 건당 10초 이내).
**독립 검증**: 셀프 결제 1건 end-to-end 성공, `checkout_metric`에 대기시간 기록·집계.

- [ ] **T015** [P] [US2] `services/cash.ts`/결제 흐름에 셀프 결제 경로 추가, 흐름 내 타임스탬프 측정점 삽입
- [X] **T016a (대기시간 계측)** [US2] 🆕 신규 — `db/migrations/015_checkout_metric.sql`(테이블) + `services/checkout-metric.ts`(`recordCheckout`/`getCheckoutMetrics`, p95·withinSlaPct) + `routes/transactions.ts`에 `POST /checkout-metric`·`GET /checkout-metrics` 추가 (FR-006, SC-004). ✅ 마이그레이션 적용·타입체크·실DB 검증(withinSlaPct=75% 산출) 완료.
- [ ] **T016** [US2] (셀프 결제 거래 자체) — 기존 `pos_source='self_kiosk'` 경로 재사용. 별도 신규 불요.
- [ ] **T017** [US2] 결제 경로에 **거버넌스 게이트(T006)** 적용 — 동의·비식별 검사 통과 필수
- [ ] **T018** [P] [US2] `contracts/api.yaml`에 셀프 결제·대기시간 엔드포인트 추가
- [ ] **T019** [P] [US2] 프론트 키오스크 모드 `frontend/src/views/kiosk/CheckoutView.vue` + 라우팅(고객 권한 분리)
- [ ] **T020** [US2] 통합 테스트 — 셀프 결제 성공 + 대기시간 ≤10초 계측·집계 검증(SC-004)

**Checkpoint**: 고객 셀프 결제 + 대기시간 KPI 독립 동작

---

## Phase 5: US3 — 오프라인 백업 결제 (P2)

**목표**: 장애 시 결제 연속성(가동률 99.99%, SC-005), 복구 시 멱등 동기화·이중결제 방지.
**독립 검증**: 장애 주입 → 결제 성공(버퍼 적재) → 복구 → 멱등 동기화로 중복 없이 반영.

- [ ] **T021** [US3] `services/local-buffer.ts` 승격 — 헬스체크 실패 감지 → 거래 로컬 버퍼 적재(멱등키 부여)
- [ ] **T022** [P] [US3] `jobs/buffer-sync.ts` 신규 — 복구 감지 시 버퍼 → 정식 거래 멱등 동기화
- [ ] **T023** [US3] `routes/transactions.ts` 확장 — `GET /api/transactions/buffer`, `POST /api/transactions/buffer/sync`(상태/수동 트리거)
- [ ] **T024** [P] [US3] `contracts/api.yaml`에 버퍼·동기화 엔드포인트 추가
- [ ] **T025** [US3] 통합 테스트 — 장애 주입·이중결제 방지·복구 동기화 검증(SC-005, 멱등성)

**Checkpoint**: 장애 상황에서도 결제 연속성·안전 동기화 독립 동작

---

## Phase 6: US4 — 외부 데이터 연동 (P2)

**목표**: 날씨·상권·유동인구를 표준 입력(`external_signal`)으로 수집(시뮬레이션 우선), 수요예측 입력 품질 향상(SC-001/003).
**독립 검증**: 시뮬레이션 어댑터가 주기 잡으로 외부 신호를 적재하고 조회 API로 노출.

- [ ] **T026** [P] [US4] `adapters/external-data/` 시뮬레이션 어댑터 구현(`ports/external-data.ts` 구현체, 시드 기반)
- [ ] **T027** [P] [US4] `jobs/external-ingest.ts` 신규 — 주기적 외부 신호 수집·`external_signal` 적재
- [ ] **T028** [US4] `routes/external.ts` 신규 — `GET /api/external/weather`, `/trade-area`, `/foot-traffic`
- [ ] **T029** [US4] `services/forecast.ts` 입력에 외부 신호 결합 훅 + 정확도 계측 연결(SC-003)
- [ ] **T030** [P] [US4] `contracts/api.yaml`에 외부 데이터 엔드포인트 추가
- [ ] **T031** [US4] 통합 테스트 — 외부 신호 적재·조회, 예측 입력 결합 검증
- [ ] **T031a** [US4] **FR-013 폴백 구현·검증** — 외부 데이터 중단 감지 시 `available=false`+`fallback` 사유 노출, 예측은 내부 데이터로 폴백. 중단→폴백→복구 통합 테스트.

**Checkpoint**: 외부 데이터가 표준 입력으로 예측에 반영(교체 가능 포트), 중단 시 안전 폴백

---

## Phase 7: US5 — KPI 통합 대시보드 (P3)

**목표**: 비전 KPI(SC-001~007)를 단일 집계·단일 화면 노출.
**독립 검증**: 대시보드가 폐기율·객단가·예측정확도·대기시간·가동률·표준화 커버리지·거버넌스 지표를 한 번에 표시.

- [ ] **T032** [US5] `services/kpi.ts` 집계 구현 완료(T008 시그니처 채움) — SC-001~007 `kpi_snapshot` 산출
- [ ] **T033** [US5] `routes/dashboard.ts` 확장 — `GET /api/dashboard/kpi`(SC-001~007 통합)
- [ ] **T034** [P] [US5] 프론트 `frontend/src/views/StandardModelView.vue` — KPI 통합 대시보드, 스토어/api 래퍼
- [ ] **T035** [P] [US5] `contracts/api.yaml`에 KPI 대시보드 엔드포인트 추가
- [ ] **T036** [US5] 통합 테스트 — SC-001~007 집계 정확성·단일 노출 검증

**Checkpoint**: 비전 KPI 한 화면 가시화

---

## Phase 8: Polish & Cross-Cutting (횡단 마무리)

- [ ] **T037** [P] 거버넌스 전 경로 적용 검증(SC-007) — 데이터/결제 경로 100% 비식별·동의 게이트 통과 통합 테스트
- [ ] **T037a** [P] **FR-017 동의 철회 경로 구현·검증** — 동의 `revoked` 전환 시 이후 수집·처리 즉시 중단, `consent/check`가 차단(403) 반환. 철회→중단 통합 테스트.
- [ ] **T038** [P] 가동률 99.99% 장애 주입 시나리오 e2e(SC-005) — 통신/서버 다운 → 오프라인 폴백 → 복구 전체 경로
- [ ] **T039** [P] `contracts/README.md` 갱신 + OpenAPI 일관성 점검(모든 신규 엔드포인트 문서화)
- [ ] **T040** [P] `quickstart.md` 작성/갱신 — 표준화·셀프결제·오프라인·외부데이터·KPI 로컬 검증 절차
- [ ] **T041** 구조화 로그·감사(`event_log`) 확장 — 표준화/결제/동기화/동의 이벤트 감사 기록
- [ ] **T042** Nginx 프록시·Docker 구성 점검(키오스크 라우팅·보안 헤더), 회귀 테스트 일괄 수행

---

## Dependencies (스토리 완료 순서)

```
Setup(T001-003)
   └─> Foundational(T004-008)   ← 모든 스토리 차단 해제
         ├─> US1 표준화(T009-014)      [P1·MVP]
         ├─> US2 셀프결제(T015-020)    [P1]  (T006 게이트 의존)
         ├─> US3 오프라인백업(T021-025)[P2]  (US2 결제 경로 권장 선행)
         ├─> US4 외부데이터(T026-031)  [P2]  (forecast 결합 T029)
         └─> US5 KPI대시보드(T032-036) [P3]  (US1~US4 지표 집계 의존)
               └─> Polish(T037-042)
```

- US1·US2는 Foundational 직후 **병렬 착수 가능**(서로 독립).
- US5(KPI)는 다른 스토리 지표를 집계하므로 **가장 마지막** 권장.
- US3는 US2 결제 경로 위에서 동작하므로 US2 선행 권장.

---

## Parallel Execution 예시

- **Foundational 내 병렬**: T005, T007, T008 동시 진행(서로 다른 파일).
- **US1 내 병렬**: T009(service) · T010(seed) · T012(contract) · T013(frontend) 동시.
- **스토리 간 병렬**: Foundational 완료 후 US1·US2를 두 작업자가 병렬 진행.
- **Polish 내 병렬**: T037·T038·T039·T040 동시.

---

## Implementation Strategy

1. **MVP = US1(표준화)** — 데이터 허브 표준화는 001/002 입력 품질의 선행 조건이라 최우선·단독 데모 가능.
2. **증분 인도**: US1 → US2(셀프결제) → US3(오프라인) → US4(외부데이터) → US5(KPI). 각 스토리는 독립 검증 가능한 단위.
3. **재사용 우선**: 신규 도메인 최소화 — `mappings`/`local-buffer`/`consent`/`kpi`/`dashboard`/`transactions` 확장 위주, 신규는 `external-data` 포트·어댑터·잡 정도.
4. **거버넌스·KPI 동반**: 각 스토리에 동의 게이트 + SC 검증 테스트를 함께 둠.

---

## 요약

- **총 태스크**: 44개 (T001~T042 + T031a, T037a)
- **스토리별**: US1 6 · US2 6 · US3 5 · US4 **7**(T031a 포함) · US5 5 / Setup 3 · Foundational 5 · Polish **7**(T037a 포함)
- **병렬 기회**: 각 스토리 내 [P] 다수, Foundational 후 US1·US2 병렬
- **MVP 권장 범위**: **US1(상품 코드 표준화)** 단독
- **추적성**: spec.md(FR-001~018·SC-001~007) ↔ data-model.md ↔ contracts/api.yaml ↔ 본 tasks 매핑 완료
- **FR 커버리지 보강**: FR-013(폴백)=T031a, FR-017(동의 철회)=T037a
