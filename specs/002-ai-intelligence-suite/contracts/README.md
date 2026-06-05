# API Contracts — 002 AI Intelligence Suite

- **api.yaml**: OpenAPI 3.0 정의. 002 인텔리전스 계층의 신규 엔드포인트만 포함한다(001 엔드포인트는 `specs/001-ai-store-ops/contracts/api.yaml` 참조).

## 인증·권한

- 001과 동일한 세션 기반 인증 + RBAC(`backend/src/middleware/rbac.ts`)를 재사용한다(FR-025).
- 점포 스코프는 인증 컨텍스트에서 결정되며, `store_id` 쿼리는 본사 운영자(HQ)가 점포를 넘나들 때만 사용한다.

## 핵심 계약 규칙

1. **처방 자동 실행 없음**: `executed` 상태로의 전이는 오직 `POST /insights/actions/{id}/approve`로만 발생한다(FR-003).
2. **LLM 응답 근거 강제**: `POST /assistant/.../messages` 응답은 항상 `had_grounding`을 포함하며, 근거가 없으면 `false`와 "데이터 없음" 콘텐츠를 반환한다(SC-010).
3. **시뮬레이션 데이터**: analytics/anomalies/devices 응답은 시뮬레이션 데이터 기반이나, 스키마는 실연동과 동일하다.
4. **이상 알림 SLA**: `anomaly_event.notified_at`은 `detected_at` + 30초 이내를 목표로 한다(SC-005).

## 계약 테스트 가이드

- 각 엔드포인트별 200/4xx 응답 스키마 검증.
- 처방 흐름: `proposed → approve → executed`, `proposed → reject` 전이 테스트.
- 비식별 보장: analytics 응답에 개인 식별자 필드 부재 확인(SC-013).
