# US5 (Phase 7, T063~T065) — 셀프 결제·Vision 모의 검증

> 구현 일자: 2026-05-22 · 누적: 65/79 작업
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

## 0. 사전 조건

M0~M4 검증 통과. backend 부팅 시 다음 잡 5종 자동 시작:
`signal-poll` / `auto-order` / `local-buffer` / `pricing-trigger` / `kpi-aggregate`
(Vision 캡처는 부팅 시 자동 시작하지 않음 — UI 또는 API로 명시 시작)

## 1. 셀프 결제 UI 검증 (`/self-checkout`)

좌측 메뉴 **"셀프 결제"** 🛒 클릭 → SelfCheckoutMockView.

### 시나리오 — 빠른 결제
1. 상단 "스캔" 카드에서 자주 쓰는 상품 버튼 **"콜라 (S1-002)"** 클릭 → 장바구니에 즉시 추가
2. **"불고기 도시락 (S1-011)"** 클릭 → 장바구니에 추가, 합계 갱신
3. 수량 input에서 콜라 수량 2로 변경 → 금액 자동 계산
4. **📱 모바일 결제** 클릭 → `✅ 결제 완료 — ₩XX,XXX` 토스트, 장바구니 초기화

### 시나리오 — 바코드 직접 입력
1. 입력 필드에 `S1-014` 입력 후 엔터 → 삼각김밥 자동 추가
2. 임의의 잘못된 코드(`XXX-999`) 입력 → "상품을 찾을 수 없습니다" 에러

### 백엔드 확인
```bash
# 거래가 self_kiosk 로 적재되었는지
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "SELECT id, pos_source, total_amount, payment_method, occurred_at FROM \`transaction\`
     WHERE pos_source = 'self_kiosk' ORDER BY id DESC LIMIT 5;"

# 재고가 자동 차감되었는지 (inventory_history reason='sale' 행)
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "SELECT product_master_id, delta, reason, occurred_at FROM inventory_history
     WHERE store_id = 1 AND reason = 'sale' ORDER BY id DESC LIMIT 10;"
```

## 2. Vision Mock 캡처

UI 우상단 **"Vision Mock ▶ 시작"** 버튼 → 백엔드 vision-mock 어댑터 시작.
- 5초마다 1단계 진행 (8단계 시나리오 × 2개 세션 회전)
- 화면 하단 "Vision 분석" 패널이 7초 간격으로 자동 새로고침
  - **존별 활동**: A1/A2/B1/EXIT 별 events·체류초·픽업·세션 수
  - **최근 행동 이벤트**: 시각, eventType(approach/dwell/pickup/path/exit), zone, 상품명
- "Vision Mock ⏹ 정지" 클릭으로 즉시 중단

### API 검증
```bash
curl -s -c /tmp/c.txt -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"store_owner_demo@example.com","password":"demo1234"}'

# Vision 시작
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/vision/start \
  -H 'content-type: application/json' -d '{}'
# → { "ok": true, "storeId": 1, "capturing": true }

# 30초 대기 후 누적된 행동 이벤트 조회
curl -s -b /tmp/c.txt "http://localhost:9532/api/stores/1/analytics/behavior?limit=20" | python3 -m json.tool

# 존별 집계
curl -s -b /tmp/c.txt http://localhost:9532/api/stores/1/analytics/zones | python3 -m json.tool

# Vision 정지
curl -s -b /tmp/c.txt -X POST http://localhost:9532/api/stores/1/vision/stop \
  -H 'content-type: application/json' -d '{}'

# DB 확인 — PII 컬럼이 전혀 없는지 (anon_session_id 만 존재)
docker exec -i mis2601-mariadb mysql -u app -p ai_store_ops -e \
  "DESCRIBE analytics_customer_behavior;
   SELECT anon_session_id, event_type, zone_code, occurred_at FROM analytics_customer_behavior
     ORDER BY id DESC LIMIT 10;"
```

## 3. 셀프 결제 → 발주·재고·리포트 연쇄 검증

1. SelfCheckoutMockView에서 5건 정도 결제
2. **재고 화면** 가서 결제한 상품의 `quantity` 가 감소했는지 확인
3. **거래/매출 화면** → 최근 거래에 `posSource: self_kiosk` 행 표시
4. **리포트 화면** → "재집계" 클릭 → 오늘 거래수·매출 즉시 반영
5. 헤더 🔔 배지에 `pos.ingest.batch` 이벤트는 info 레벨이라 알림은 안 가지만, EventPanel 최근 이벤트에는 표시

## 4. PII/Analytics 분리 검증 (FR-020)

```sql
-- analytics_* 에는 PII 컬럼이 없어야 함
SHOW COLUMNS FROM analytics_customer_behavior;
-- id, store_id, anon_session_id, event_type, zone_code, product_master_id, dwell_seconds, occurred_at, created_at

-- pii_* 와 analytics_* 는 명명·외래키로 완전 분리
SHOW TABLES LIKE 'pii_%';
SHOW TABLES LIKE 'analytics_%';
```

Vision Mock은 anonymous UUID 세션만 발급 — 얼굴/번호 등 식별자 일체 미수집.

## 5. US5 체크리스트

- [ ] `/self-checkout` 진입 시 입력 필드 autofocus
- [ ] 빠른 추가 버튼·바코드 입력·수량 조정 모두 동작
- [ ] 결제 시 `transaction.pos_source = 'self_kiosk'` 행 적재
- [ ] `inventory_history` 에 sale 음수 delta 동시 적재
- [ ] Vision Mock 시작 → 5초마다 `analytics_customer_behavior` 행 증가
- [ ] 존별 활동 표가 7초 주기로 자동 갱신
- [ ] Vision 정지 → 이벤트 발생 멈춤
- [ ] `analytics_customer_behavior` 에 phone/email 등 PII 컬럼 없음
- [ ] 900px↓ 폭에서 grid가 1열로 축소

## 6. 다음 단계 (Phase 8 Polish — 마감)

T066~T079 (14개): PII 가드 강화, 매핑 검토 화면, 감사 1년 파티셔닝, 동의 관리, RFC 7807 에러, OpenAPI 정적, Vitest/Jest 골격 보강, Dockerfile + Nginx + GitLab CI, i18n, 헬스/메트릭.
