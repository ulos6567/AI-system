# Phase 1: Data Model (MariaDB)

**Feature**: AI 기반 점포 운영 시스템
**Date**: 2026-05-15
**Plan**: [plan.md](./plan.md)

본 문서는 spec.md의 12개 Key Entity를 MariaDB(InnoDB) 스키마로 정규화한다. 명명 규약: 소문자_스네이크, PK는 `id BIGINT UNSIGNED AUTO_INCREMENT`, 모든 테이블에 `created_at`, `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` 부여(생략).

---

## 1. 사용자·점포·권한

### `store`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| code | VARCHAR(32) UNIQUE | 가맹점 코드 |
| name | VARCHAR(128) | |
| address | VARCHAR(255) | |
| lat, lng | DECIMAL(10,7) | 위치(유동인구·푸시 반경용) |
| timezone | VARCHAR(32) DEFAULT 'Asia/Seoul' | |
| open_hours_json | JSON | 요일별 운영시간 |
| status | ENUM('active','suspended','closed') | |

### `user`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT UNSIGNED PK | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt |
| display_name | VARCHAR(128) | |
| global_role | ENUM('SUPER_ADMIN','HQ_OPERATOR','STORE_USER') | |
| last_login_at | DATETIME | |

### `store_user` (다대다·점포 스코프 역할)
| 컬럼 | 타입 |
|------|------|
| store_id (FK→store) | BIGINT UNSIGNED |
| user_id (FK→user) | BIGINT UNSIGNED |
| store_role | ENUM('STORE_OWNER','STORE_STAFF') |
| PK | (store_id, user_id) |

---

## 2. 상품·재고

### `product_master`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| master_code | VARCHAR(64) UNIQUE |
| name | VARCHAR(255) |
| category | VARCHAR(64) |
| barcode | VARCHAR(32) INDEX |
| shelf_life_days | INT | 유통기한 일수 |
| temp_zone | ENUM('ambient','chilled','frozen') |

### `product_local_mapping`
점포별 상이한 메뉴명·코드를 마스터에 매핑(FR-004).
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | BIGINT UNSIGNED FK |
| local_code | VARCHAR(64) |
| local_name | VARCHAR(255) |
| product_master_id | BIGINT UNSIGNED FK NULL |
| confidence | DECIMAL(3,2) | 자동 매핑 신뢰도 |
| status | ENUM('auto','confirmed','rejected','pending') |
| UNIQUE | (store_id, local_code) |

### `inventory`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | BIGINT UNSIGNED FK |
| product_master_id | BIGINT UNSIGNED FK |
| quantity | INT |
| shelf_location | VARCHAR(32) |
| expires_at | DATE NULL |
| UNIQUE | (store_id, product_master_id, expires_at) |

### `inventory_history`
재고 변동 이력(감사·분석).
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id, product_master_id | FK |
| delta | INT | + 입고, − 판매/폐기 |
| reason | ENUM('sale','order_receive','discard','adjust','transfer') |
| occurred_at | DATETIME INDEX |

---

## 3. 거래(POS·셀프·앱)

### `transaction`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | BIGINT UNSIGNED FK INDEX |
| pos_source | ENUM('pos','self_kiosk','app') |
| occurred_at | DATETIME INDEX |
| total_amount | DECIMAL(12,2) |
| payment_method | VARCHAR(32) |
| pii_app_user_id | BIGINT UNSIGNED FK NULL | (있을 경우만) |

### `transaction_item`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| transaction_id | FK INDEX |
| product_master_id | FK |
| quantity | INT |
| unit_price | DECIMAL(10,2) |
| discount_applied | DECIMAL(10,2) DEFAULT 0 |
| pricing_event_id | FK NULL | 어떤 동적 가격이 적용되었는지 |

---

## 4. 수요 예측·발주

### `demand_forecast`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id, product_master_id | FK |
| target_date | DATE |
| predicted_quantity | INT |
| confidence | DECIMAL(3,2) |
| model_version | VARCHAR(32) |
| generated_at | DATETIME |
| UNIQUE | (store_id, product_master_id, target_date) |

### `purchase_order`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | FK |
| order_date | DATE |
| status | ENUM('draft','pending_review','approved','sent','received','cancelled','failed') |
| source | ENUM('auto','manual') |
| sent_at, received_at | DATETIME NULL |
| approved_by_user_id | FK NULL |
| auto_hold_reason | VARCHAR(255) NULL | FR-017 비정상 발주 보류 사유 |

### `purchase_order_item`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| purchase_order_id | FK |
| product_master_id | FK |
| ordered_quantity | INT |
| received_quantity | INT NULL |

---

## 5. 가격 전략 (동적 가격·ESL)

### `pricing_rule`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | FK NULL | NULL = 전사 룰 |
| name | VARCHAR(128) |
| trigger_type | ENUM('shelf_life','weather','demand_drop','manual','schedule') |
| trigger_config_json | JSON |
| action_type | ENUM('percent_off','fixed_price','bundle') |
| action_config_json | JSON |
| is_active | BOOLEAN |

### `pricing_event` (실제 적용 이력)
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id, product_master_id | FK |
| pricing_rule_id | FK |
| original_price | DECIMAL(10,2) |
| adjusted_price | DECIMAL(10,2) |
| effective_from, effective_to | DATETIME |
| esl_push_status | ENUM('pending','sent','failed') |
| audit_meta_json | JSON | FR-021 감사 |

---

## 6. 외부 신호 (날씨·유동인구·이벤트)

### `external_signal`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | FK NULL | NULL = 지역 단위 |
| region_code | VARCHAR(32) NULL |
| signal_type | ENUM('weather','foot_traffic','event','holiday','competitor') |
| occurred_at | DATETIME INDEX |
| payload_json | JSON |
| source | VARCHAR(64) | 기상청, 통신사, 수기 등 |

---

## 7. 앱 사용자·개인정보 (PII 영역 — 분리 권한)

### `pii_app_user`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| phone_hash | CHAR(64) UNIQUE | SHA-256 해시 |
| nickname | VARCHAR(64) |
| device_token | VARCHAR(255) NULL | 푸시 알림용 |
| registered_at | DATETIME |

### `pii_app_user_consent`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| pii_app_user_id | FK |
| consent_type | ENUM('marketing_push','behavior_analytics','location') |
| granted | BOOLEAN |
| granted_at | DATETIME |

---

## 8. 비식별 고객 행동 (Analytics 영역)

### `analytics_customer_behavior`
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | FK |
| anon_session_id | CHAR(36) | UUID, 익명 |
| event_type | ENUM('dwell','path','pickup','approach_shelf','exit') |
| zone_code | VARCHAR(16) |
| product_master_id | FK NULL |
| dwell_seconds | INT NULL |
| occurred_at | DATETIME INDEX |

---

## 9. 알림·이벤트·감사

### `event_log` (운영 이벤트 + 감사)
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id | FK NULL |
| user_id | FK NULL |
| severity | ENUM('info','warn','error','critical') |
| event_type | VARCHAR(64) | 'order.auto_sent', 'pricing.applied', 'inventory.stockout', 'system.down' 등 |
| message | VARCHAR(512) |
| metadata_json | JSON |
| occurred_at | DATETIME INDEX |

### `notification` (점주 수신함)
| 컬럼 | 타입 |
|------|------|
| id | BIGINT UNSIGNED PK |
| store_id, user_id | FK |
| event_log_id | FK NULL |
| title | VARCHAR(255) |
| body | TEXT |
| read_at | DATETIME NULL |
| delivered_channels_json | JSON | 'sse','email','sms' |

---

## 10. 성과·KPI 집계

### `performance_kpi_daily`
| 컬럼 | 타입 |
|------|------|
| store_id | FK |
| metric_date | DATE |
| revenue | DECIMAL(14,2) |
| transactions_count | INT |
| avg_ticket | DECIMAL(10,2) |
| discard_amount | DECIMAL(14,2) |
| discard_rate | DECIMAL(5,4) |
| labor_cost | DECIMAL(14,2) NULL |
| forecast_mape | DECIMAL(5,4) NULL |
| PK | (store_id, metric_date) |

---

## 관계도 요약 (텍스트 ER)

```
user ─┬─ store_user ─┬─ store ─┬─ inventory ─ inventory_history
      │              │         ├─ transaction ─ transaction_item ─ pricing_event
      │              │         ├─ purchase_order ─ purchase_order_item
      │              │         ├─ demand_forecast
      │              │         ├─ pricing_event ← pricing_rule
      │              │         ├─ external_signal
      │              │         ├─ analytics_customer_behavior
      │              │         ├─ event_log → notification
      │              │         └─ performance_kpi_daily
      │              │
product_master ──── product_local_mapping (store별)
pii_app_user ─ pii_app_user_consent
            └─ transaction (선택적 링크)
```

---

## 검증 규칙 (FR 매핑)

| 규칙 | FR |
|------|----|
| 상품 매핑 신뢰도가 0.7 미만이면 `status='pending'` 강제 | FR-004 |
| `purchase_order.auto_hold_reason`이 설정되면 `status='pending_review'`로만 전이 가능 | FR-017 |
| `pricing_event.audit_meta_json`에 트리거 입력값·룰 ID 필수 | FR-021 |
| `pii_*` 테이블 접근은 `PII_ACCESS` 권한 필수 | FR-019, FR-020 |
| `analytics_*` 테이블에는 PII 컬럼 금지(코드 리뷰 룰) | FR-020 |
| `event_log` 보존 기간 ≥ 1년(파티셔닝 권장) | FR-021, SC-013 |

---

## 인덱스 권장(요지)

- `transaction(store_id, occurred_at DESC)` — 점포별 거래 조회
- `inventory_history(store_id, occurred_at DESC)` — 변동 이력
- `external_signal(store_id, signal_type, occurred_at DESC)` — 신호 결합
- `event_log(store_id, severity, occurred_at DESC)` — 알림 조회
- `performance_kpi_daily(metric_date)` — 본사 리포트
