# Quickstart: 차세대 편의점 표준 모델 (003) — 개발·검증 가이드

**Feature**: `003-next-gen-cvs-standard`
**전제**: 001/002와 동일 개발 환경(기존 `mis2601` 백엔드·프론트·DB). 신규 스택 없음.

---

## 0. 준비

```bash
cd /Users/pioneer12/mis2601
# 브랜치 (tasks T001)
git checkout -b 003-next-gen-cvs-standard
# 환경변수 (tasks T002) — .env.example 참고
#   EXTERNAL_DATA_MODE=sim
#   OFFLINE_BUFFER_ENABLED=true
#   HEALTHCHECK_INTERVAL_MS=5000
```

## 1. 마이그레이션 (tasks T004~T005)

신규/확장 테이블 적용: `standard_product`, `product_code_mapping`, `offline_payment_buffer`, `external_signal`, `checkout_metric`, `kpi_snapshot`.

```bash
# 기존 마이그레이션 러너 사용
npm --prefix backend run migrate   # 또는 프로젝트 표준 스크립트
```

검증: 유니크 인덱스(`offline_payment_buffer.idempotency_key`, `standard_product.standard_code`) 생성 확인.

## 2. 스토리별 로컬 검증

### US1 — 표준화 (SC-006)
```bash
# 표준 마스터 시드 후 점포 원시코드 매핑
curl -s 'localhost:PORT/api/mappings/coverage?storeId=1' | jq
# 기대: coveragePct ≥ 95, unmappedItems 명시(추정 매핑 없음)
```

### US2 — 셀프 결제 (SC-004)
```bash
curl -s -XPOST localhost:PORT/api/transactions/self-checkout \
  -H 'content-type: application/json' \
  -d '{"storeId":1,"idempotencyKey":"k1","items":[{"standardCode":"STD-001","qty":1}]}' | jq
# 기대: waitMs ≤ 10000, outcome=completed
# 동의 미확보 subjectRef → 403 (거버넌스 게이트)
```

### US3 — 오프라인 백업 (SC-005)
```bash
# 장애 주입(헬스체크 강제 실패) → 결제 시 버퍼 적재
curl -s 'localhost:PORT/api/transactions/buffer?storeId=1' | jq   # syncStatus=buffered
# 복구 후 동기화
curl -s -XPOST localhost:PORT/api/transactions/buffer/sync -d '{"storeId":1}' | jq
# 기대: 동일 idempotencyKey 재호출 시 skipped 증가(이중결제 없음)
```

### US4 — 외부 데이터 (SC-001/003)
```bash
curl -s 'localhost:PORT/api/external/weather?storeId=1' | jq
# 중단 시: available=false, fallback 사유 노출 → 예측은 내부 데이터 폴백
```

### US5 — KPI 대시보드 (SC-001~007)
```bash
curl -s 'localhost:PORT/api/dashboard/kpi?storeId=1' | jq
# 기대: SC-001~007 7개 지표 단일 응답
```

## 3. 통합 테스트 (tasks T014/T020/T025/T031/T036/T037/T038)

```bash
npm --prefix backend test -- 003   # backend/test/003/*
```

핵심 검증:
- 커버리지 ≥95% + 미매핑 명시(SC-006)
- 셀프 결제 대기 ≤10초(SC-004)
- 장애 주입 → 이중결제 없음 + 멱등 동기화(SC-005)
- 동의 미확보 차단 + 철회 시 수집 중단(SC-007)
- 외부데이터 중단 → 내부 폴백(FR-013)
- KPI 7지표 단일 집계 정확성

## 4. 정확도 지표 (SC-003)
예측 정확도 = **100 − MAPE**(품목·일 단위), 목표 ≥90% (research R7).
