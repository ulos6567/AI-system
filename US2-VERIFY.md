# US2 (Phase 4, T040~T049) — 실시간 알림·모니터링 검증

> 구현 일자: 2026-05-22 · 누적: 49/79 작업
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

## 0. 사전 조건

- M0·M1 검증 통과 (M0-VERIFY.md, US1-VERIFY.md)
- backend 부팅 시 자동 시작되는 잡 3종:
  - `signal-poll` (30분, 즉시 1회)
  - `auto-order` (30분)
  - **`local-buffer` (15초 DB ping)** ← 신규

## 1. SSE 실시간 알림 — 30초 이내 표시

### 1-1. 시나리오 A: 자동 발주 보류 알림

탭1: `http://localhost:9512` 로그인 → 어떤 화면이든 열어둠. 헤더의 🟢 점이 SSE 연결 표시.

탭2 / 터미널: 강제로 보류 발주를 만들도록 시드 추가 후 auto-generate:

```bash
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e "
  INSERT INTO purchase_order (store_id, order_date, status, source, created_at)
    VALUES (1, CURDATE() - INTERVAL 5 DAY, 'received', 'auto', NOW() - INTERVAL 5 DAY);
  SET @po = LAST_INSERT_ID();
  INSERT INTO purchase_order_item (purchase_order_id, product_master_id, ordered_quantity)
    VALUES (@po, 4, 1);"

# 로그인 쿠키로 auto-generate
curl -s -b /tmp/c.txt -X POST \
  http://localhost:9532/api/stores/1/orders/auto-generate \
  -H 'content-type: application/json' -d '{}'
```

**기대**: 탭1 헤더의 🔔 배지에 **30초 이내** 빨간 숫자가 뜬다. 종 클릭 → 드로어에 "⚠️ 자동 발주 보류" 알림. 동시에 "최근 이벤트(점포)" 섹션에 `order.auto_held` 행 추가.

### 1-2. 시나리오 B: 매핑 미해소 거래 → 거부 알림

```bash
# 매핑 안 된 local_code 로 거래 ingest
curl -s -b /tmp/c.txt -X POST \
  http://localhost:9532/api/stores/1/transactions/ingest \
  -H 'content-type: application/json' \
  -d '{"transactions":[{
    "externalId":"BAD-1","occurredAt":"2026-05-22T13:00:00Z",
    "posSource":"pos","totalAmount":100,
    "items":[{"localCode":"NOT_EXIST","quantity":1,"unitPrice":100}]
  }]}'
```

**기대**: 즉시 "⚠️ POS 거래 거부" 알림 + 헤더 배지 증가.

## 2. 재고 화면 — 임박 필터 (`/inventory`)

좌측 메뉴 "재고" 클릭. 초기에는 모든 행 표시.

- 상단 4개 metric: 전체 / 임박 / 저재고 / 결품
- 체크박스 "유통기한 임박만" ON → 도시락·삼각김밥류만 남음 (시드: 1일 후 만료)
- 임계 일수 7로 변경 → 우유 등도 포함
- 카테고리 = "lunchbox" → 도시락만
- 결품(quantity=0) 행은 빨간색, 임박은 노란색, 저재고는 파란색

## 3. 거래/매출 화면 — Chart.js (`/transactions`)

- 상단 메트릭 3개: 총 매출 / 거래 건수 / 평균 객단가
- 기본: 최근 30일 daily 막대(매출) + 라인(건수) 차트
- 집계 변경 → weekly / monthly 으로 차트 갱신
- 기간 변경(from/to) → 즉시 재조회

## 4. 오프라인 → 복구 동기화

```bash
# 1) DB 컨테이너 정지 (네트워크 단절 모사)
docker stop mis2601-mariadb

# 2) backend 로그에 "DB ping failed — switching to offline mode" 표시 (15초 내)
#    /healthz 호출 시 online=false 응답
curl -s http://localhost:9532/api/healthz | python3 -m json.tool

# 3) 이 상태에서는 DB 의존 라우터가 500 으로 떨어진다.
#    bufferTransaction() 을 직접 호출하는 통합 라우터는 1차 범위가 아니므로,
#    검증은 코드 경로(local-buffer.ts 의 ping/flush) 로그 확인으로 대체:
docker start mis2601-mariadb

# 4) 15~30초 후 backend 로그:
#    "DB recovered — flushing local buffer"
#    "buffered=0" 인 경우 flush 생략
#    event_log 에 system.recovered 적재 + 알림으로도 dispatch
```

`/healthz` 응답에 `online`, `buffered` 가 노출되며, 운영 환경에서는 이 둘을 모니터링 보드에 띄워두는 것을 권장.

## 5. 헤더 SSE 연결 상태

- 🟢 = SSE 연결됨
- ⚪ = 재연결 시도 중 (백엔드 재시작·Nginx 끊김 등). useEventStream 의 지수 백오프(1s → 30s)로 자동 재연결.

## 6. US2 체크리스트

- [ ] SSE 채널 `/api/stores/1/events/stream` 응답 헤더에 `content-type: text/event-stream`, `X-Accel-Buffering: no`
- [ ] 자동 발주 보류 발생 → 30초 이내 헤더 배지 증가
- [ ] EventPanel "전체 읽음" 버튼이 unreadCount 0 으로 즉시 반영
- [ ] InventoryView 의 nearExpiry 필터·임계일·카테고리가 즉시 재조회
- [ ] TransactionsView 의 daily/weekly/monthly 전환 시 차트 갱신
- [ ] `docker stop mariadb` 후 backend 로그에 offline 전이, `docker start` 후 자동 복구 + `system.recovered` 알림 도달
- [ ] 모바일 폭 < 480px 에서도 모든 화면 정상 동작

## 7. 다음 단계 (Phase 5 — US3)

- 가격 룰 엔진(`shelf_life`/`weather`/`demand_drop`/`schedule`/`manual` 트리거)
- ESL·푸시 mock adapter + 가격 적용 이력 화면
- 가격 룰 관리 화면 (CRUD)
