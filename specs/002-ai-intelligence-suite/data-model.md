# Phase 1: Data Model (MariaDB)

**Feature**: AI 인텔리전스·처방형 운영 인사이트
**Date**: 2026-06-05
**Plan**: [plan.md](./plan.md)

본 문서는 spec.md의 9개 신규 Key Entity를 MariaDB(InnoDB) 스키마로 정규화한다. 001 명명 규약 준수: 소문자_스네이크, PK `id BIGINT UNSIGNED AUTO_INCREMENT`, 모든 테이블에 `created_at`, `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`(생략). 001 테이블(`store`, `product_master`, `user`, `transaction`, `demand_forecast`, `customer_behavior_event`, `event_log`)을 FK로 참조한다.

---

## 1. 처방형 인텔리전스

### `operational_signal` — 운영 신호
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| signal_type | ENUM('sales_drop','waste_risk','demand_surge','overstock','weather_impact') | |
| severity | TINYINT UNSIGNED | 1~5 강도 |
| product_id | FK→product_master NULL | 관련 상품(있으면) |
| detected_at | DATETIME | |
| payload_json | JSON | 탐지 근거 데이터 스냅샷 |
| status | ENUM('open','actioned','dismissed','expired') DEFAULT 'open' | |

### `prescriptive_action` — 처방 액션
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| signal_id | FK→operational_signal | |
| store_id | FK→store | |
| action_type | ENUM('price_markdown','promotion','reorder','reallocate','staffing') | |
| target_product_id | FK→product_master NULL | |
| recommendation_json | JSON | 대상·조정폭·실행시점 |
| expected_effect_json | JSON | 예상 매출/폐기/객단가 변화 |
| rationale | TEXT | 판단 근거(FR-006) |
| confidence | DECIMAL(4,3) | 0~1 |
| priority | INT | 정렬용(예상효과×긴급도) |
| **status** | ENUM('proposed','approved','executed','rejected','expired') DEFAULT 'proposed' | **자동 실행 없음(FR-003)** |
| approved_by | FK→user NULL | 승인 점주 |
| approved_at | DATETIME NULL | |
| executed_ref_json | JSON NULL | 연결된 pricing_event/purchase_order 참조 |
| reject_reason | VARCHAR(255) NULL | |

**상태 전이**: `proposed` → (`approved` → `executed`) | `rejected` | `expired`. `approved`/`executed`는 점주 승인 후에만 진입.

### `action_outcome` — 처방 효과 검증
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| action_id | FK→prescriptive_action | |
| baseline_json | JSON | 실행 시점 베이스라인 스냅샷 |
| actual_json | JSON | 검증 기간 후 실제 지표 |
| accuracy | DECIMAL(4,3) | 예상 대비 적중도(±20% 기준) |
| verified_at | DATETIME | |
| hit | BOOLEAN | 적중 여부(SC-002) |

---

## 2. Vision AI 고객 분석 (시뮬레이션 데이터)

### `behavior_insight` — 행동/히트맵 집계 (비식별)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| insight_date | DATE | 집계 일자 |
| zone_code | VARCHAR(32) | 매대/존 코드 |
| dwell_weight | DECIMAL(8,2) | 체류 가중치(히트맵) |
| pass_count | INT UNSIGNED | 통과 수 |
| pickup_count | INT UNSIGNED | 집음 |
| putback_count | INT UNSIGNED | 다시 내려놓음 |
| demo_segment_json | JSON | 추정 연령대·성별 분포(비식별) |

> 원천 이벤트는 001 `customer_behavior_event`(비식별)를 사용. 식별 데이터 미저장(SC-013).

---

## 3. 이상 징후 감지 (시뮬레이션 데이터)

### `anomaly_event` — 이상 이벤트
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| anomaly_type | ENUM('unpaid_exit','disturbance','collapse','intrusion') | |
| severity | TINYINT UNSIGNED | 1~5 |
| zone_code | VARCHAR(32) NULL | |
| detected_at | DATETIME | |
| snapshot_ref | VARCHAR(255) NULL | 캡처 참조(시뮬레이션) |
| notified_at | DATETIME NULL | 점주 알림 시각(30초 SLA, SC-005) |
| escalated | BOOLEAN DEFAULT 0 | 외부 관제 전파(FR-015) |
| false_positive | BOOLEAN NULL | 점주 오탐 피드백(FR-016) |
| resolution | VARCHAR(255) NULL | 대응 결과 |

---

## 4. IoT 예지보전 (시뮬레이션 데이터)

### `device` — 장비
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| device_type | ENUM('fridge','showcase','freezer','hvac') | |
| label | VARCHAR(64) | |
| spec_json | JSON | 정상 범위 임계값 |
| status | ENUM('normal','warning','critical','offline') DEFAULT 'normal' | |

### `device_reading` — 센서 측정값
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| device_id | FK→device | |
| reading_at | DATETIME | |
| temperature | DECIMAL(5,2) NULL | |
| power_watt | DECIMAL(8,2) NULL | |

*(시계열 — `(device_id, reading_at)` 인덱스)*

### `maintenance_alert` — 예지보전 경고
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| device_id | FK→device | |
| risk_level | ENUM('info','warning','critical') | |
| predicted_failure_at | DATETIME NULL | 예상 고장 시점 |
| recommended_action | VARCHAR(255) | 권장 조치 |
| raised_at | DATETIME | |
| acknowledged_at | DATETIME NULL | |

---

## 5. AI 경영 비서 (외부 LLM)

### `assistant_conversation` — 대화
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| user_id | FK→user | |
| started_at | DATETIME | |

### `assistant_message` — 메시지
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| conversation_id | FK→assistant_conversation | |
| role | ENUM('user','assistant') | |
| content | TEXT | |
| sources_json | JSON NULL | 근거 데이터 출처·기간(FR-020) |
| linked_action_id | FK→prescriptive_action NULL | 연결 처방(FR-021) |
| had_grounding | BOOLEAN | 근거 동반 여부(SC-010) |
| created_at | DATETIME | |

---

## 6. 인력 스케줄러

### `employee` — 직원
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| name | VARCHAR(64) | |
| hourly_wage | INT UNSIGNED | 원/시 |
| availability_json | JSON | 요일·시간대 가용성 |

### `work_schedule` — 근무 스케줄
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| store_id | FK→store | |
| week_start | DATE | |
| status | ENUM('draft','confirmed') DEFAULT 'draft' | |
| estimated_labor_cost | INT UNSIGNED | 예상 인건비(FR-024) |
| constraint_violations_json | JSON NULL | 제약 위반 명시(FR-023) |

### `work_shift` — 시프트
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| schedule_id | FK→work_schedule | |
| employee_id | FK→employee | |
| shift_date | DATE | |
| start_time | TIME | |
| end_time | TIME | |

---

## 7. 상품 미디어

### `product_media` — 상품 이미지
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| product_id | FK→product_master | |
| image_url | VARCHAR(512) | 실제 상품 이미지 |
| is_fallback | BOOLEAN DEFAULT 0 | 카테고리 대체 이미지 여부(FR-009) |
| sort_order | INT DEFAULT 0 | |

---

## 감사 연계

처방 승인/실행, AI 응답, 이상 대응은 001 `event_log`에 감사 레코드를 남긴다(FR-027, SC-012). 신규 `event_type` 값: `action_approved`, `action_executed`, `action_rejected`, `assistant_query`, `anomaly_notified`, `anomaly_feedback`, `maintenance_alert`, `schedule_confirmed`.

---

## 인덱스 요약

| 테이블 | 인덱스 |
|--------|--------|
| operational_signal | (store_id, status, detected_at) |
| prescriptive_action | (store_id, status, priority) |
| anomaly_event | (store_id, detected_at), (false_positive) |
| device_reading | (device_id, reading_at) |
| behavior_insight | (store_id, insight_date, zone_code) |
| assistant_message | (conversation_id, created_at) |
| work_shift | (schedule_id, shift_date) |
| product_media | (product_id, sort_order) |
