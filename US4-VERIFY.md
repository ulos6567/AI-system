# US4 (Phase 6, T059~T062) — 운영 성과 리포트 검증

> 구현 일자: 2026-05-22 · 누적: 62/79 작업
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

## 0. 사전 조건

- M0~M3 검증 통과
- backend 부팅 시 자동 시작: `signal-poll` / `auto-order` / `local-buffer` / `pricing-trigger` / **`kpi-aggregate` (1시간)** ← 신규
- 시드 거래(02_transactions.sql, 최근 7일)가 적재되어 있어야 차트에 표시됨

## 1. 백엔드 자동 집계 확인

backend 부팅 직후 1회 즉시 실행. 콘솔 로그:
```
{...} kpi-aggregate started
{...} kpi aggregated  day=2026-05-22 stores=3
```

수동으로도 호출 가능:
```bash
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "SELECT * FROM performance_kpi_daily WHERE store_id = 1 ORDER BY metric_date DESC LIMIT 10;"
```

## 2. API 조회

```bash
# 로그인
curl -s -c /tmp/c.txt -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"store_owner_demo@example.com","password":"demo1234"}'

# 최근 28일 일간 리포트
curl -s -b /tmp/c.txt "http://localhost:9532/api/stores/1/reports/daily" | python3 -m json.tool

# 기간 명시
curl -s -b /tmp/c.txt "http://localhost:9532/api/stores/1/reports/daily?from=2026-05-01&to=2026-05-22"

# 누락된 일자 재집계 (시연용)
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/reports/backfill \
  -H 'content-type: application/json' \
  -d '{"from":"2026-05-15","to":"2026-05-22"}'
```

응답 구조:
```json
{
  "storeId": 1,
  "from": "2026-04-24",
  "to": "2026-05-22",
  "summary": {
    "revenue": 1234567.0,
    "transactionsCount": 210,
    "avgTicket": 5879.84,
    "discardAmount": 12300.0,
    "discardRate": 0.0099,
    "avgMape": 0.241
  },
  "series": [ { "metricDate": "2026-04-24", "revenue":..., "transactionsCount":..., "discardRate":..., "forecastMape":..., ... }, ... ]
}
```

## 3. UI 검증 (`/reports`)

좌측 메뉴 **"리포트"** 클릭 → ReportsView.

### 메트릭 카드 5개
- 총 매출 / 거래 건수 / 평균 객단가 / **폐기율(주황)** / 평균 MAPE
- 기간 비교 체크 ON 시 각 카드 아래에 `vs +X%` / `vs −Y%` 표시

### 차트 3개
- **매출 & 거래수**: 막대(매출, 좌측축) + 라인(거래수, 우측축). 비교 시 점선 매출 라인 추가
- **폐기율 추이**: 빨간 영역 라인 (현재) + 회색 점선 (비교)
- **예측 정확도 MAPE**: 보라 영역 라인. 0% 분모 일자는 `spanGaps: true` 로 끊기지 않음

### 일별 상세 표
- 날짜 / 매출 / 거래수 / 객단가 / 폐기액 / 폐기율 / MAPE — 모든 일자 행

### 기간 비교 토글
- "기간 비교" 체크 → 비교 From/To 입력 노출 → 두 기간을 같은 축에서 비교

### "재집계" 버튼
- 현재 기간을 강제 backfill → 폐기·거래 시드를 직접 INSERT 한 직후 즉시 차트에 반영하고 싶을 때 사용

## 4. 폐기 시연 → 폐기율 차트 동작 확인

```bash
# 폐기 이력 직접 INSERT (어제 날짜로)
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "INSERT INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at)
     VALUES (1, 11, -5, 'discard', NOW() - INTERVAL 1 DAY),
            (1, 12, -3, 'discard', NOW() - INTERVAL 1 DAY);"

# 재집계
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/reports/backfill \
  -H 'content-type: application/json' \
  -d '{"from":"2026-05-21","to":"2026-05-22"}'
```
→ 리포트 화면 새로고침 시 어제 폐기율이 0%에서 N% 로 점프하는 모습 확인.

## 5. MAPE 동작 확인

US1 시점에 `POST /forecasts/generate` 를 어제 일자로 한 번 호출했다면, 시드 거래(어제)와 비교해 MAPE 값이 계산되어 표시됨. forecast 가 0 인 일자는 actual<=0 이면 분모 제외, 표/차트에 `—` 표기.

## 6. US4 체크리스트

- [ ] backend 부팅 시 `kpi-aggregate started` 로그 + 즉시 1회 집계
- [ ] `performance_kpi_daily` 테이블에 점포×일자 행 적재 (UNIQUE PK 멱등)
- [ ] `GET /reports/daily` summary 가 series 합산과 일치
- [ ] ReportsView 5개 메트릭 카드 + 3개 차트 모두 렌더링
- [ ] "기간 비교" 토글 → 점선 비교 데이터셋 추가
- [ ] "재집계" 버튼 → 폐기 INSERT 후 폐기율 차트 즉시 반영
- [ ] 모바일 폭(640px↓)에서 카드가 2열, 차트 높이 220px 으로 축소

## 7. 다음 단계 (Phase 7 — US5)

- Vision 모의 어댑터(사전녹화 동선 데이터셋 → analytics_customer_behavior)
- transactions/ingest 의 `pos_source=self_kiosk|app` 지원 + 재고 자동 차감
- SelfCheckoutMockView (셀프 결제 스캔)
