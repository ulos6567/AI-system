# Data Model: 차세대 편의점 표준 모델 — 통합·완성 계층

**Feature**: `003-next-gen-cvs-standard`
**Spec**: [spec.md](./spec.md) (Key Entities) · **Plan**: [plan.md](./plan.md) (§Data Model)
**Created**: 2026-06-10
**대상 DB**: 기존 001/002와 동일(MariaDB). 신규/확장 테이블만 증분 마이그레이션(tasks T004).

> 표기: PK=기본키, FK=외래키, UQ=유니크. 시각은 `DATETIME`(UTC 저장). 금액은 정수(KRW).

---

## 엔티티 개요 (spec §Key Entities ↔ 테이블)

| spec 엔티티 | 테이블 | 신규/확장 | 관련 FR |
|---|---|---|---|
| 표준 상품 | `standard_product` | 신규 | FR-004 |
| 상품 코드 매핑 | `product_code_mapping` | 확장 | FR-001~004 |
| 오프라인 결제 버퍼 | `offline_payment_buffer` | 신규 | FR-008~010 |
| 결제 대기 지표 | `checkout_metric` | 신규 | FR-006 |
| 외부 신호 | `external_signal` | 신규 | FR-011~013 |
| KPI 스냅샷 | `kpi_snapshot` | 확장 | FR-014 |
| 동의 | `consent` (001/002 재사용) | 재사용 | FR-016~017 |

---

## 1. `standard_product` (표준 상품 마스터) — FR-004

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGINT | PK, AUTO | |
| `standard_code` | VARCHAR(64) | UQ, NOT NULL | 본사 기준 표준 상품 코드 |
| `name` | VARCHAR(255) | NOT NULL | 표준 명칭 |
| `category` | VARCHAR(128) | NULL | 분류 |
| `is_active` | TINYINT(1) | NOT NULL DEFAULT 1 | |
| `created_at` | DATETIME | NOT NULL | |
| `updated_at` | DATETIME | NOT NULL | |

- **소유/갱신**: 본사 기준(Assumptions). 점포 커스텀은 후속.

## 2. `product_code_mapping` (점포 원시코드 ↔ 표준코드) — FR-001~003

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGINT | PK, AUTO | |
| `store_id` | BIGINT | FK→store, NOT NULL | 점포 |
| `raw_code` | VARCHAR(128) | NOT NULL | 점포 원시 상품 코드 |
| `raw_name` | VARCHAR(255) | NULL | 점포 원시 명칭 |
| `standard_code` | VARCHAR(64) | FK→standard_product.standard_code, NULL | 매핑된 표준 코드(미매핑 시 NULL) |
| `status` | ENUM('mapped','unmapped','review') | NOT NULL DEFAULT 'unmapped' | **미매핑 명시(FR-002)** |
| `match_method` | ENUM('exact','rule','manual') | NULL | 매핑 방식(추정 금지 → ML 없음) |
| `confidence` | DECIMAL(4,3) | NULL | 규칙 기반 신뢰도(0~1) |
| `updated_at` | DATETIME | NOT NULL | |

- **UQ**: (`store_id`, `raw_code`)
- **규칙(FR-002)**: 자동 추정 매핑 금지. 규칙 미적중 시 `status='unmapped'` 또는 `'review'`로 둔다.

## 3. `offline_payment_buffer` (오프라인 결제 버퍼) — FR-008~010

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGINT | PK, AUTO | |
| `idempotency_key` | VARCHAR(64) | UQ, NOT NULL | **멱등키(FR-009, 이중결제 방지)** |
| `store_id` | BIGINT | FK→store, NOT NULL | |
| `payload` | JSON | NOT NULL | 거래 스냅샷(품목·금액·시각) |
| `amount` | INT | NOT NULL | 총액(KRW) |
| `buffered_at` | DATETIME | NOT NULL | 장애 중 적재 시각 |
| `sync_status` | ENUM('buffered','syncing','synced','failed') | NOT NULL DEFAULT 'buffered' | 동기화 상태(FR-010) |
| `synced_transaction_id` | BIGINT | FK→transaction, NULL | 복구 후 정식 거래 연결 |
| `synced_at` | DATETIME | NULL | |

- **동기화(FR-010)**: 복구 감지 시 `idempotency_key`로 멱등 반영. 이미 `synced`면 재반영하지 않음.

## 4. `checkout_metric` (셀프 결제 대기시간) — FR-006

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGINT | PK, AUTO | |
| `store_id` | BIGINT | FK→store, NOT NULL | |
| `transaction_id` | BIGINT | FK→transaction, NULL | 완료 거래(미완료 시 NULL) |
| `channel` | ENUM('self','staff') | NOT NULL DEFAULT 'self' | 셀프/직원 |
| `started_at` | DATETIME | NOT NULL | 결제 시작 |
| `completed_at` | DATETIME | NULL | 완료(미완료 시 NULL) |
| `wait_ms` | INT | NULL | 대기시간(ms) = completed-started |
| `outcome` | ENUM('completed','abandoned') | NOT NULL | 완료/이탈(Edge Case) |

- **SC-004**: 피크타임 `wait_ms ≤ 10000`. `abandoned`은 대기 통계에서 분리.

## 5. `external_signal` (외부 신호) — FR-011~013

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGINT | PK, AUTO | |
| `signal_type` | ENUM('weather','trade_area','foot_traffic') | NOT NULL | 종류 |
| `store_id` | BIGINT | FK→store, NULL | 점포/상권 단위(전역이면 NULL) |
| `observed_at` | DATETIME | NOT NULL | 관측 시각 |
| `value` | JSON | NOT NULL | 표준 입력 값(온도·강수·유동인구 등) |
| `source` | VARCHAR(64) | NOT NULL DEFAULT 'sim' | 출처(sim/실연동) |
| `ingested_at` | DATETIME | NOT NULL | 수집 시각 |

- **UQ**: (`signal_type`, `store_id`, `observed_at`)
- **폴백(FR-013)**: 신규 수집 중단 시 최신 유효 레코드 사용 또는 "데이터 없음" 표시. 예측은 내부 데이터로 폴백.

## 6. `kpi_snapshot` (KPI 스냅샷) — FR-014

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BIGINT | PK, AUTO | |
| `store_id` | BIGINT | FK→store, NULL | 점포/전사(NULL) |
| `period_start` | DATETIME | NOT NULL | 집계 기간 시작 |
| `period_end` | DATETIME | NOT NULL | 집계 기간 종료 |
| `waste_reduction_pct` | DECIMAL(5,2) | NULL | SC-001 폐기율 감소 |
| `revenue_uplift_pct` | DECIMAL(5,2) | NULL | SC-002 객단가·매출 상승 |
| `forecast_accuracy_pct` | DECIMAL(5,2) | NULL | SC-003 예측 정확도 |
| `checkout_wait_p95_ms` | INT | NULL | SC-004 대기시간 p95 |
| `uptime_pct` | DECIMAL(6,3) | NULL | SC-005 가동률 |
| `mapping_coverage_pct` | DECIMAL(5,2) | NULL | SC-006 표준화 커버리지 |
| `governance_compliance_pct` | DECIMAL(5,2) | NULL | SC-007 비식별·동의 준수 |
| `created_at` | DATETIME | NOT NULL | |

- **단일 집계(FR-014)**: SC-001~007을 한 스냅샷에 모은다. 대시보드(FR-015)는 본 테이블을 단일 소스로 노출.

## 7. `consent` (동의, 재사용) — FR-016~017

기존 001/002 `consent` 자산 재사용. 003은 **수집·결제 경로 진입 전 게이트**로 참조하고, **철회(revoked) 상태 시 이후 수집 중단**(FR-017)에 활용. 신규 컬럼 불필요(상태 enum에 `granted`/`revoked` 존재 가정).

---

## 관계 요약

```
store 1─* product_code_mapping *─1 standard_product
store 1─* offline_payment_buffer 0..1─1 transaction
store 1─* checkout_metric 0..1─1 transaction
store 0..1─* external_signal
store 0..1─* kpi_snapshot
customer 1─* consent   (게이트 참조)
```

## 검증 규칙 (FR/SC 추적)

- FR-002/SC-006: `status='unmapped'`는 추정으로 채우지 않는다. 커버리지 = mapped / 전체.
- FR-009: `idempotency_key` UQ 위반 시 신규 삽입 거부(이중결제 차단).
- FR-006/SC-004: `wait_ms`는 `completed_at` 존재 시에만 계산.
- FR-013: `external_signal` 부재·중단 시 예측 입력에서 제외하고 상태 플래그 노출.
- FR-016/SC-007: 고객 식별자는 저장하지 않음(비식별 집계만). `external_signal.value`·`checkout_metric`에 개인식별자 금지.
