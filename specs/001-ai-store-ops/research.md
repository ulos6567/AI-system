# Phase 0: Research & Decisions

**Feature**: AI 기반 점포 운영 시스템
**Date**: 2026-05-15
**Plan**: [plan.md](./plan.md)

본 문서는 [Intent-Plan.md](./Intent-Plan.md)에서 지정된 스택(Vue+Node+MariaDB+Docker) 위에서 spec.md의 요구사항을 충족하기 위해 필요한 **6개 핵심 의사결정**을 다룬다.

---

## R-001. AI 수요 예측 모델 서빙

- **Decision**: 1차 — 통계 베이스라인(이동평균 + 요일/날씨 가중치). 2차 — 정확도(MAPE) 한계 도달 시 별도 Python 추론 서비스로 분리.
- **Rationale**: spec.md SC-002(예측 정확도 30% 개선)는 절대 정확도가 아닌 **수동 발주 대비 상대 개선치**이며, 통계 모델로도 달성 가능. 단일 Node 스택을 유지해 인프라 복잡도 최소화. Python 분리는 어댑터 인터페이스로 가역적.
- **Alternatives Considered**:
  - TensorFlow.js 내장 — 학습/디버깅 부담 큼, 학기 범위에 과함.
  - 외부 SaaS(AWS Forecast 등) — 비용·계정 의존 부담.
- **Impact**: `services/forecast/` 모듈 + `adapters/forecast/baseline.ts` 구현. 후속 시 `adapters/forecast/ml-service.ts` 추가.

---

## R-002. 실시간 이벤트 전송 방식

- **Decision**: **SSE (Server-Sent Events)**. WebSocket은 사용하지 않음.
- **Rationale**: spec.md FR-016(30초 내 알림)·FR-008(ESL 자동 반영) 요구사항이 모두 서버→클라이언트 단방향. SSE는 HTTP·Nginx·Express 기본 인프라로 동작, 자동 재연결·프록시 친화적.
- **Alternatives Considered**:
  - Socket.IO — 양방향 기능 미사용, 의존성 증가.
  - 폴링(Polling) — 30초 SLA에 부적합·서버 부하.
- **Impact**: `backend/src/routes/events.stream.ts`에 SSE 라우트, Nginx `proxy_buffering off` 설정 필요.

---

## R-003. 인증·권한 모델

- **Decision**:
  - 웹 포털: **세션 쿠키(httpOnly, SameSite=Lax) + CSRF 토큰**
  - 외부/모바일 API: **JWT(짧은 만료 + refresh)**
  - 권한: **RBAC 4역할** — `SUPER_ADMIN`, `HQ_OPERATOR`, `STORE_OWNER`, `STORE_STAFF` + 점포 단위 스코프
- **Rationale**: FR-019(역할별 접근 권한 분리)·FR-020(개인정보 분리)의 감사 요구를 만족. 세션은 브라우저 보안 기본, JWT는 모바일/외부 통합 확장 시.
- **Alternatives Considered**:
  - JWT 단일 사용 — XSS 노출 위험, 세션 무효화 어려움.
  - OAuth 2.0(외부 IdP) — 1차 범위 과함, 후속 단계 고려.
- **Impact**: `middleware/auth/`, `middleware/rbac/`, 점포 스코프 가드 미들웨어 필수.

---

## R-004. 외부 어댑터 통합 패턴

- **Decision**: **Port-Adapter(헥사고날) 패턴**. 모든 외부 의존(POS·날씨·AI·ESL·푸시·물류)을 `adapters/<name>/`로 분리하고 인터페이스(`ports/`)를 통해서만 서비스가 접근.
- **Rationale**: spec.md 4개 어댑터 그룹 모두 1차 모의 → 후속 실연동 단계가 명시되어 있어 교체 비용을 영(0)에 가깝게 유지해야 함. 테스트도 어댑터 모킹으로 단순화.
- **Alternatives Considered**:
  - 직접 호출(서비스 내 fetch) — 테스트·교체 어려움.
  - 메시지 큐(RabbitMQ/Kafka) — 1차 범위 과함, 어댑터 내부에서 큐를 도입할 여지로 남김.
- **Impact**: `backend/src/ports/`, `backend/src/adapters/<name>/`. 각 어댑터는 `mock.ts`와 `real.ts` 동시 보유.

---

## R-005. 데이터베이스 마이그레이션·시드

- **Decision**: **node-pg-migrate** 또는 **Umzug + 순수 SQL 파일**. SQL 우선(Intent-Plan.md가 "SQL 쿼리 기반 데이터 조작" 명시).
- **Rationale**: ORM(예: TypeORM/Prisma)을 도입하지 않고 mysql2 + SQL 직접 사용을 명시했으므로, 마이그레이션도 SQL 파일 + 가벼운 러너 채택. 학기 범위·디버깅 용이.
- **Alternatives Considered**:
  - Prisma — 강력하지만 Intent-Plan.md의 "SQL 쿼리 기반" 방침과 충돌.
  - Knex.js — 쿼리 빌더 + 마이그레이션 통합. 후순위 후보.
- **Impact**: `db/migrations/NNN_*.sql` + `npm run db:migrate` 스크립트(Node 단일 진입점).

---

## R-006. 개인정보·비식별 데이터 분리

- **Decision**: **스키마 레벨 분리**. `pii_*` 접두사 테이블(앱 사용자 식별 정보·결제 이력·동의)과 `analytics_*` 접두사 테이블(비식별 동선·체류·집계)을 별도 권한 그룹으로 분리. 안면 데이터는 1차 미수집.
- **Rationale**: spec.md FR-020 및 개인정보보호법 적합성. 분석 쿼리는 `analytics_*`만 접근, PII 접근은 별도 감사 로그.
- **Alternatives Considered**:
  - 별도 데이터베이스 분리 — 비용·운영 복잡도 증가. 학기 범위에 과함.
  - 단일 테이블 + 컬럼 마스킹 — 누출 위험 높음.
- **Impact**: data-model.md에 `pii_app_user`, `pii_app_user_consent` 등 별도 명명. RBAC에 `PII_ACCESS` 권한 추가.

---

## 부수 결정(요약)

| 항목 | 결정 | 근거 |
|------|------|------|
| 로깅 | 구조화 JSON(pino) + DB `event_log` 감사 테이블 | FR-021 |
| 타임존 | 서버 UTC 저장 + 점포 단위 KST 표시 | 다점포 확장성 |
| 국제화(i18n) | 1차 한국어만, vue-i18n 골격만 준비 | 외국인 다국어는 후속 |
| PWA | 1차 데스크톱 + 반응형. 푸시 알림은 웹 푸시 API | 모바일 네이티브 후속 |
| 파일 업로드 | 점포 일괄 CSV 업로드(POS 어댑터 모의용) | 1차 데모 |
| 에러 처리 | 표준 RFC 7807(Problem Details for HTTP) | API 일관성 |

---

## NEEDS CLARIFICATION (없음)

본 단계에서 진행을 막는 미해결 항목은 없음. plan.md의 Open Questions는 `/speckit.clarify`로 이관.
