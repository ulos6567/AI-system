# US3 (Phase 5, T050~T058) — 동적 가격·마케팅 검증

> 구현 일자: 2026-05-22 · 누적: 58/79 작업
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

## 0. 사전 조건

- M0~M2 검증 통과
- backend 부팅 시 자동 시작: `signal-poll` / `auto-order` / `local-buffer` / **`pricing-trigger` (15분)** ← 신규

## 1. 가격 룰 등록 (UI)

1. 좌측 메뉴 "가격 룰" 클릭 → PricingRulesView
2. "+ 새 룰" 클릭. 폼:
   - 이름: `도시락 마감 30% 할인`
   - 점포: `1`
   - 트리거: `유통기한 임박` → 기본 JSON `{ "threshold_days": 1 }` 자동 채움
   - 액션: `% 할인` → `{ "percent": 30, "duration_hours": 4 }`
3. 저장 → 룰 목록에 ID 표시
4. "평가" 버튼 클릭 → 토스트 `✅ 룰 #N 평가 완료 — K건 적용` (시드 도시락이 내일 만료이므로 hit)

## 2. 가격 룰 등록 (API)

```bash
# 로그인 (admin or store_owner)
curl -s -c /tmp/c.txt -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"store_owner_demo@example.com","password":"demo1234"}'

# 룰 생성: 도시락 임박 30% 할인
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/pricing/rules \
  -H 'content-type: application/json' \
  -d '{
    "storeId": 1,
    "name": "도시락 마감 할인",
    "triggerType": "shelf_life",
    "triggerConfig": { "threshold_days": 1 },
    "actionType": "percent_off",
    "actionConfig": { "percent": 30, "duration_hours": 4 }
  }'

# 룰 평가 (수동)
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/pricing/rules/1/evaluate \
  -H 'content-type: application/json' \
  -d '{"storeId": 1}'
# → { "id": 1, "applied": N, "events": [{ "pricingEventId":..., "productName":..., "originalPrice":..., "adjustedPrice":..., "eslStatus":"pending" }, ...] }

# 적용 이력 조회
curl -s -b /tmp/c.txt http://localhost:9532/api/stores/1/pricing-events?limit=20
```

## 3. 적용 이력 화면

좌측 메뉴 "가격 이력" → 적용 시각·상품·룰·트리거·원가→할인가·할인%·유효기간·ESL 상태가 표로 표시.
- ESL `sent` → 녹색, `pending` → 노란색, `failed` → 빨간색
- 적용 후 1초 뒤 ESL mock 어댑터가 `pending → sent` 전이 (DB 컬럼은 그대로 → 다음 평가 시 sent 표시 확인 가능)

## 4. SSE 알림 동시 발사

평가 직후 헤더 🔔 배지에 `💲 동적 가격 적용` 알림 자동 도달 (US2 디스패처 활용).
EventPanel 열어보면 알림 + `pricing.applied` 이벤트 동시 표시.

## 5. 트리거별 추가 시연 예시

### 날씨 트리거 (음료 할인)
```json
{
  "name": "비 오는 날 음료 할인",
  "storeId": null,
  "triggerType": "weather",
  "triggerConfig": { "min_rain_mm": 1, "product_master_ids": [1, 2, 3, 22] },
  "actionType": "percent_off",
  "actionConfig": { "percent": 15, "duration_hours": 6 }
}
```
시드의 외부 신호에 `rain_mm: 2.3` 행이 있으므로 매칭 가능.

### 스케줄 트리거 (주말 저녁 도시락)
```json
{
  "name": "주말 저녁 도시락 할인",
  "storeId": 1,
  "triggerType": "schedule",
  "triggerConfig": { "days_of_week": ["sat","sun"], "start_hour": 17, "end_hour": 21, "product_master_ids": [11, 12, 13] },
  "actionType": "fixed_price",
  "actionConfig": { "price": 3500, "duration_hours": 4 }
}
```

## 6. 자동 평가 스케줄러

`pricing-trigger` 잡이 15분마다 모든 active 룰을 자동 평가. 백엔드 로그 `pricing-trigger tick evaluated=K applied=M` 확인. 적용된 건이 있으면 `pricing.batch_run` audit 적재.

## 7. US3 체크리스트

- [ ] PricingRulesView에서 5종 트리거 × 3종 액션 폼이 정상 표시·저장
- [ ] "평가" 버튼 → 토스트 표시 + 이력 화면에 새 행 추가
- [ ] 임박 도시락에 대해 `original > adjusted` 적용 + ESL `pending → sent` 모사
- [ ] 평가 직후 헤더 🔔 배지에 알림 30초 이내 도달
- [ ] `pricing_event.audit_meta_json` 에 ruleId·triggerContext·actionConfig 보존 (FR-021)
- [ ] `event_log` 에 `pricing.applied` + `esl.queued` + (있다면) `pricing.batch_run` 행
- [ ] 모바일 폭에서 룰 폼이 1열로, 이력 표는 가로 스크롤로 표시

## 8. 다음 단계 (Phase 6 — US4)

- KPI 일간 집계 잡 (`performance_kpi_daily`)
- `GET /api/stores/:id/reports/daily` + 리포트 화면 (폐기율·매출·MAPE 차트)
