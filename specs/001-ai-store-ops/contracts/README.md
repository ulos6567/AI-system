# API Contracts

- **api.yaml** — OpenAPI 3.0 정의. spec.md FR-001~024와 1:1 추적 가능.

## FR ↔ Endpoint 매핑

| FR | 엔드포인트 |
|----|----------|
| FR-001 POS 수집 | `POST /api/stores/{id}/transactions/ingest` |
| FR-002 외부 데이터 | `GET /api/external-signals` |
| FR-003 행동 데이터 | (백엔드 내부 어댑터 + analytics 테이블, 외부 노출 없음) |
| FR-004 상품 매핑 | `GET/POST/PATCH /api/stores/{id}/product-mappings*` |
| FR-005 수요 예측 | `GET /api/stores/{id}/forecasts` |
| FR-006 자동 발주 | `POST /api/stores/{id}/orders/auto-generate`, `PATCH /api/stores/{id}/orders/{oid}` |
| FR-007 동적 가격 | `POST /api/pricing/rules`, `pricing-events` 자동 생성 |
| FR-008 ESL 반영 | `pricing_event.esl_push_status` (ESL 어댑터 비동기 송신) |
| FR-009 푸시 알림 | (백엔드 푸시 어댑터, `notification` 테이블) |
| FR-010 진열 제안 | (별도 추천 엔드포인트, 후속 추가) |
| FR-011 셀프·앱 결제 | `POST /api/stores/{id}/transactions/ingest` (pos_source 구분) |
| FR-012 상품 자동 인식 | (Vision 어댑터, 결과를 transaction.items에 반영) |
| FR-013 AI 어시스턴트 | (별도 채팅 엔드포인트, 1차 범위 외 가능) |
| FR-014 원격 상담 | (외부 화상 솔루션 연동, 인터페이스만) |
| FR-015 모바일 모니터링 | `GET /api/stores/{id}/*` 전반 |
| FR-016 이벤트 알림 30초 | `GET /api/stores/{id}/events/stream` (SSE) |
| FR-017 비정상 발주 보류 | `PurchaseOrder.autoHoldReason` + `status='pending_review'` |
| FR-018 오프라인 동기화 | (프론트 IndexedDB 큐 + 재연결 시 ingest) |
| FR-019 RBAC | 모든 엔드포인트 미들웨어, `CurrentUser.scopedStores` |
| FR-020 개인정보 분리 | `pii_*` 테이블 + `PII_ACCESS` 권한 |
| FR-021 감사 | `pricing_event.audit_meta_json`, `event_log` |
| FR-022 리포트 | `GET /api/stores/{id}/reports/daily` |
| FR-023 표준 인터페이스 | OpenAPI 자체가 표준 인터페이스 |
| FR-024 데이터 추출 | (별도 추출 엔드포인트, 후속) |
