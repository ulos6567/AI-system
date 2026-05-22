# US1 (Phase 3, T025~T039) — MVP 검증 가이드

> 구현 일자: 2026-05-22 · Branch: `001-ai-store-ops` · 누적: 39/79 작업
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

## 0. 사전 조건

M0 검증 통과(M0-VERIFY.md). 다음이 동작 상태여야 함:
- `docker compose ... mariadb` healthy
- backend `npm run db:migrate && npm run db:seed` 적용 완료
- `store_owner_demo@example.com / demo1234` 로그인 가능

## 1. 백엔드 실행 (포트 9532)

```bash
cd backend && npm install && npm run dev
```

부팅 시 자동 시작되는 백그라운드 잡:
- `signal-poll` (30분, 부팅 즉시 1회) — KMA 또는 mock weather → `external_signal`
- `auto-order` (30분) — 점포별 마감 -2h 도달 시 자동 발주 생성

## 2. 핵심 API 수동 검증

```bash
# 로그인 (세션 쿠키 저장)
curl -s -c /tmp/c.txt -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"store_owner_demo@example.com","password":"demo1234"}'

# 거래 적재 (JSON)
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/transactions/ingest \
  -H 'content-type: application/json' \
  -d '{
    "transactions":[{
      "externalId":"DEMO-1",
      "occurredAt":"2026-05-22T11:30:00Z",
      "posSource":"pos",
      "totalAmount":4500,
      "paymentMethod":"card",
      "items":[{"localCode":"S1-001","quantity":2,"unitPrice":1200}]
    }]
  }'
# → { "accepted": 1, "rejected": 0 }

# 거래 적재 (CSV)
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/transactions/ingest \
  -H 'content-type: text/csv' \
  --data-binary $'external_id,occurred_at,total,payment,pos_source,local_code,qty,unit_price\nDEMO-2,2026-05-22T12:00:00Z,3000,cash,pos,S1-002,1,3000'

# 예측 강제 재산출
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/forecasts/generate \
  -H 'content-type: application/json' -d '{}'

# 자동 발주 1회 실행
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/orders/auto-generate \
  -H 'content-type: application/json' -d '{}'
# → { "purchaseOrderId": N, "status": "approved"|"pending_review", "autoHoldReason": null|"...", ... }

# 발주 목록
curl -s -b /tmp/c.txt http://localhost:9532/api/stores/1/orders

# 발주 상세
curl -s -b /tmp/c.txt http://localhost:9532/api/stores/1/orders/N

# 보류건 승인·송신
curl -s -b /tmp/c.txt -X PATCH http://localhost:9532/api/stores/1/orders/N \
  -H 'content-type: application/json' -d '{"action":"approve"}'

# event_log 확인 (감사)
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "SELECT id, event_type, severity, message, occurred_at FROM event_log ORDER BY id DESC LIMIT 10;"
```

## 3. 프론트엔드 (포트 9512)

```bash
cd ../frontend && npm install && npm run dev
```

브라우저:
1. `http://localhost:9512/` → 로그인 페이지 자동 이동
2. `store_owner_demo@example.com / demo1234` 입력 → `/orders` 진입
3. **OrdersView**:
   - 상단: 점포 번호, 대상일(내일 default), 마감 카운트다운 (남은 시간 < 1h이면 강조)
   - "다음 영업일 예측" 카드: 상품별 예측수량·신뢰도(70%↑ 녹색 / 미만 주황)
   - **"자동 발주 생성"** 클릭 → 토스트 표시:
     - 정상 → 녹색, `status: 승인됨/송신완료`
     - 보류 → 주황, `보류 사유: ...` 표시
   - "최근 발주" 표: ID 클릭 → 상세 패널, 상태별 배지, `pending_review` 행에는 "승인·송신" 버튼
4. 모바일 폭(< 768px): 햄버거 메뉴, 카드 단단 정렬, 표 폰트 축소(< 640px)

## 4. 보류·승인 분기 시연

데모 시드는 과거 발주 이력이 없어 보통 정상(`approved → sent`)로 흐릅니다.
보류 분기를 보려면:

```bash
# 동일 상품의 가짜 과거 발주를 1건 작게 만들고 다시 auto-generate
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "INSERT INTO purchase_order (store_id, order_date, status, source, created_at) VALUES (1, CURDATE() - INTERVAL 5 DAY, 'received', 'auto', NOW() - INTERVAL 5 DAY);
   SET @po = LAST_INSERT_ID();
   INSERT INTO purchase_order_item (purchase_order_id, product_master_id, ordered_quantity) VALUES (@po, 4, 1);"
# → 이후 auto-generate 호출 시 product_master_id=4 의 발주가 평균(1)의 3배 초과면 pending_review 로 잡힘
```

## 5. US1 체크리스트

- [ ] `POST /transactions/ingest` JSON·CSV 모두 적재 성공, `inventory_history` 행 증가
- [ ] `POST /forecasts/generate` 후 `demand_forecast` 행 생성, 동일 (store,product,date) 재실행 시 upsert
- [ ] `POST /orders/auto-generate` 가 `purchase_order` + `purchase_order_item` 생성
- [ ] 정상 건은 `status=sent` + `sent_at` 채움 + `logistics-mock send` 로그
- [ ] 보류 건은 `status=pending_review` + `auto_hold_reason` 채움, `event_log` 에 `order.auto_held` 행
- [ ] `PATCH /orders/:id action=approve` 후 `status=sent` 전이
- [ ] OrdersView 에서 모든 흐름이 화면으로 확인됨
- [ ] 모바일 폭에서 표·카드가 깨지지 않음
- [ ] 401 발생 시 자동 `/login` 리다이렉트

## 6. 다음 단계 (Phase 4 — US2)

- 이벤트 디스패처(`event_log` → `notification` + SSE 발행)
- `GET /api/stores/:id/events/stream` SSE 라우터
- 재고/거래 라우터, InventoryView/TransactionsView, 이벤트 패널
- 오프라인 로컬 보존·복구 동기화
