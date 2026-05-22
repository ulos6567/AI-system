# Implementation Plan: AI 기반 점포 운영 시스템

**Branch**: `001-ai-store-ops`
**Spec**: [spec.md](./spec.md)
**Stack Source**: [Intent-Plan.md](./Intent-Plan.md)
**Created**: 2026-05-15
**Status**: Phase 0~1 Complete · Ready for `/speckit.tasks`

---

## Summary

`spec.md`의 24개 기능 요구사항(FR-001~024)과 15개 성공 기준(SC-001~015)을 충족하는 **AI 점포 운영 관리 포털**을 구축한다. 본 계획은 Intent-Plan.md에서 지정된 **Vue.js 3 + Node.js(Express) + MariaDB + Docker** 풀스택을 기반으로, 시스템을 다음 3개 구현 범위로 분할한다:

1. **운영 관리 포털 (1차 구현 범위)** — 가맹점주·본사 운영자가 발주·재고·매출·이벤트를 모니터링·제어하는 웹 애플리케이션.
2. **데이터 통합 백엔드** — POS·외부 데이터(날씨·유동인구)·AI 추론 결과를 수집·집계·노출하는 REST API 서비스.
3. **외부 서비스 어댑터(시뮬레이션 포함)** — AI 모델, AI 카메라, ESL, 푸시 알림, 물류 시스템은 **외부 서비스 어댑터**로 모듈화. 1차에서는 모의(mock) 어댑터로 동작 검증 후, 실제 연동은 후속 단계에서 교체 가능.

본 1차 구현은 학기 단위에 실현 가능한 범위로 한정하며, 실시간 AI 카메라 추론·하드웨어 ESL 송출은 **인터페이스 정의 + 모의 데이터 어댑터**로 대체한다.

---

## Technical Context

| 항목 | 결정 | 출처/근거 |
|------|------|----------|
| **언어/런타임** | Node.js 20 LTS + TypeScript 5.x | Intent-Plan.md |
| **프론트엔드** | Vue.js 3.4+ (Composition API) + Pinia + Vite 5.x | Intent-Plan.md |
| **백엔드** | Express.js 4.x + TypeScript | Intent-Plan.md |
| **DB** | MariaDB (mysql2 드라이버) | Intent-Plan.md |
| **컨테이너/배포** | Docker + Nginx 리버스 프록시 + GitLab CI/CD | Intent-Plan.md |
| **인증** | 세션/JWT 하이브리드 (점주·직원·관리자 RBAC) | spec.md FR-019 |
| **API 스타일** | RESTful JSON | Intent-Plan.md(REST 전제) |
| **테스트** | Vitest(프론트) + Jest/Supertest(백엔드) | 업계 표준 |
| **로깅·감사** | 구조화 로그(JSON) + DB 감사 테이블 | spec.md FR-021 |
| **DB 자격증명** | `.env` 환경변수로 주입 (소스코드·문서에 평문 금지) | 보안 |

### 외부 통합 어댑터(인터페이스 정의 + 1차 모의 구현)

| 어댑터 | 1차 구현 | 후속 단계 |
|--------|---------|----------|
| POS 어댑터 | CSV/JSON 업로드 + 시뮬레이션 스트림 | 토스플레이스·나이스정보통신 실제 연동 |
| 외부 데이터 | 기상청/공공 API 폴링(읽기 전용) | 통신사 유동인구·SNS API 추가 |
| AI 수요 예측 | 통계 베이스라인(이동평균·요일별 가중) | 머신러닝 모델 서빙(별도 Python 서비스 가능) |
| AI 카메라/Vision | 사전 녹화된 동선 데이터셋 재생 | 실제 Vision AI 서비스 연동 |
| ESL 제어 | 가격 변경 이벤트 큐 적재(로그만) | ESL 벤더 API 연동 |
| 푸시 알림 | 콘솔/DB 기록 | FCM·APNs 연동 |
| 물류 자동 발주 | 모의 응답 + CSV 익스포트 | 물류사 EDI/REST 연동 |

---

## Constitution Check

프로젝트에 `.specify/memory/constitution.md`가 존재하지 않으므로, 본 계획은 다음 **기본 원칙(default principles)**을 자체 채택한다:

| 원칙 | 본 계획 준수 여부 |
|------|------------------|
| 명세 우선 (Spec-first) | ✅ spec.md를 source of truth로 사용 |
| 비밀정보 비노출 | ✅ DB 비밀번호 등은 `.env`로 분리, 문서·코드 평문 금지 |
| 테스트 가능성 | ✅ 각 FR이 자동화 테스트 또는 명시적 수동 검증 가능 |
| 가역적 의사결정 | ✅ 외부 어댑터는 인터페이스 분리로 교체 가능 |
| 점진적 도입 | ✅ 1차 모의 → 후속 실연동 단계 명시 |
| 데이터 최소 수집 | ✅ 개인 식별 데이터는 명시적 동의 + 비식별 분리 (FR-020) |

→ **게이트 통과**. 위반 사항 없음.

---

## Project Structure

```
specs/001-ai-store-ops/
├── spec.md                    # 비즈니스 명세 (완료)
├── plan.md                    # 본 문서
├── research.md                # Phase 0 산출물
├── data-model.md              # Phase 1: DB 스키마
├── quickstart.md              # Phase 1: 개발 환경 가이드
├── contracts/
│   ├── api.yaml               # OpenAPI 3.0 정의
│   └── README.md
├── checklists/
│   └── requirements.md        # 명세 품질 체크리스트
└── Intent-*.md                # 워크플로 단계별 메타

repo-root/                     # (향후 구현 단계에서 생성)
├── frontend/                  # Vue.js 3 + TS + Vite + Pinia
│   ├── src/
│   │   ├── views/             # 대시보드·발주·재고·이벤트·설정
│   │   ├── components/
│   │   ├── stores/            # Pinia 상태 관리
│   │   ├── api/               # 백엔드 호출 래퍼
│   │   └── router/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── backend/                   # Node.js + Express + TS
│   ├── src/
│   │   ├── routes/            # REST 라우터 (auth, stores, orders, pricing, events, …)
│   │   ├── services/          # 비즈니스 로직
│   │   ├── adapters/          # POS·외부데이터·AI·ESL·푸시·물류 어댑터
│   │   ├── db/                # mysql2 쿼리·마이그레이션
│   │   ├── middleware/        # 인증·RBAC·로깅·에러
│   │   └── jobs/              # 스케줄러(자동 발주·집계)
│   ├── tests/
│   ├── tsconfig.json
│   └── package.json
├── db/
│   ├── migrations/            # *.sql 파일
│   └── seeds/                 # 데모 데이터
├── docker/
│   ├── docker-compose.yml     # frontend + backend + mariadb + nginx
│   ├── nginx/
│   └── Dockerfile.*
├── .env.example               # DB·시크릿 변수 템플릿 (값 없음)
├── .gitignore                 # .env 제외 필수
└── .gitlab-ci.yml
```

---

## Phase 0: Outline & Research

→ 산출물: [research.md](./research.md)

핵심 의사결정 요약:

1. **AI 모델 서빙 전략** — Phase 1은 통계 베이스라인(이동평균 + 요일·날씨 가중)으로 시작. 정확도 한계 도달 시 별도 Python 추론 서비스로 분리. → Node 단일 스택 유지 가능.
2. **실시간성** — WebSocket(Socket.IO) 또는 SSE. SSE 채택(단방향 알림 90%, 구현 단순).
3. **인증** — 세션 쿠키 + httpOnly + CSRF 토큰. JWT는 모바일·외부 API 전용으로 한정.
4. **권한 모델** — RBAC 4역할(SUPER_ADMIN, HQ_OPERATOR, STORE_OWNER, STORE_STAFF) + 점포 단위 스코프.
5. **개인정보 분리** — `pii.*` 테이블과 `analytics.*` 테이블 스키마 분리, 안면 데이터는 미수집(1차 범위 제외).
6. **CI/CD** — GitLab CI 단계: lint → test → build → docker push → deploy(staging) → manual prod.
7. **테스트 전략** — 핵심 비즈니스 서비스 단위 테스트 + 주요 REST 엔드포인트 통합 테스트 + 프론트엔드 컴포넌트 vitest.

---

## Phase 1: Design & Contracts

### Data Model

→ 산출물: [data-model.md](./data-model.md)

spec.md의 12개 Key Entity를 MariaDB 정규화 스키마(약 18개 테이블)로 매핑. 핵심 테이블:

- `store`, `user`, `store_user`(다대다·역할)
- `product_master`, `product_local_mapping`
- `inventory`, `inventory_history`
- `transaction`, `transaction_item`
- `demand_forecast`
- `purchase_order`, `purchase_order_item`
- `pricing_rule`, `pricing_event`
- `external_signal`(날씨·이벤트 등)
- `app_user`, `app_user_consent`(개인정보 분리)
- `customer_behavior_event`(비식별)
- `notification`, `event_log`(감사)
- `performance_kpi_daily`

### API Contracts

→ 산출물: [contracts/api.yaml](./contracts/api.yaml) (OpenAPI 3.0)

주요 엔드포인트 그룹:

| 그룹 | 경로 | 주요 동작 |
|------|------|---------|
| 인증 | `/api/auth/*` | 로그인·로그아웃·세션 갱신 |
| 점포 | `/api/stores/*` | 점포 CRUD, 사용자/권한 관리 |
| 상품·재고 | `/api/products/*`, `/api/inventory/*` | 마스터 매핑·재고 조회 |
| 거래 | `/api/transactions/*` | POS 수집·조회·통계 |
| 발주 | `/api/orders/*` | 예측·자동 생성·확정·취소 |
| 가격 전략 | `/api/pricing/*` | 룰 CRUD·실행 이력 |
| 이벤트 | `/api/events/*` | 알림·이상 감지·SSE 스트림 |
| 외부 신호 | `/api/external-signals/*` | 날씨·유동인구 조회 |
| 리포트 | `/api/reports/*` | KPI·폐기율·매출 집계 |

### Quickstart

→ 산출물: [quickstart.md](./quickstart.md)

---

## Phase 2: Task Planning Approach

> 본 단계는 본 명령으로 실행하지 않으며, `/speckit.tasks` 단계에서 산출한다.

작업 분해 원칙(미리 정의):

1. **수직 슬라이스 우선** — 가맹점주의 1번 시나리오(자동 발주 모니터링)를 end-to-end로 먼저 구현하고 점진 확장.
2. **계층 순서** — DB 마이그레이션 → 백엔드 서비스 → REST 엔드포인트 → 프론트 화면 → E2E 검증.
3. **어댑터 후순위** — 외부 어댑터는 인터페이스/모의 구현부터, 실연동은 마지막 스프린트.
4. **테스트 동반** — 각 백엔드 라우터 PR에 통합 테스트 1개 이상 동반.

---

## Post-Design Constitution Re-Check

| 원칙 | 재검토 |
|------|--------|
| 비밀정보 비노출 | ✅ data-model.md·contracts/api.yaml 모두 자격증명 미포함, `.env` 분리 |
| 가역성 | ✅ 외부 어댑터·AI 추론은 인터페이스 분리, 교체 가능 |
| 테스트 가능성 | ✅ contracts/api.yaml 기반 계약 테스트 가능 |
| 데이터 최소 수집 | ✅ 개인정보 테이블 분리, 안면 데이터 1차 범위 외 |
| 명세 일치 | ✅ FR-001~024와 라우터/엔드포인트 1:1 매핑 가능 |

→ **재검토 통과**. 다음 단계(`/speckit.tasks`) 진행 가능.

---

## Complexity Tracking

| 항목 | 복잡도 | 대응 |
|------|--------|------|
| 다중 외부 어댑터(POS·날씨·AI·ESL·푸시·물류) | 高 | 어댑터 인터페이스 격리 + 1차 모의 구현 |
| 실시간 이벤트 푸시 | 中 | SSE 단방향 채택(WebSocket 회피) |
| 개인정보·비식별 분리 | 中 | 스키마 분리 + 동의 테이블 |
| 다국어 프로모션(혜택 항목) | 低 | 1차 범위 외, 후속 단계 |
| 안면 인식·완전 무인 매장 | 高 | **1차 범위 제외**(spec.md Out of Scope) |
| 실시간 AI 추론 서빙 | 高 | 통계 베이스라인으로 1차 대체 |

---

## Open Questions / Deferred to `/speckit.clarify`

1. 시범 매장 수와 데모 데이터 규모(점포 수×기간)
2. SLA 합의 수준(가용성·복구 시간 목표가 SC-011/015 수준으로 충분한지)
3. 모바일 앱(고객용 푸시 수신·결제 스캔) 1차 범위 포함 여부 — 현재 가정: **웹 PWA로 대체, 네이티브 모바일은 후속**

→ 위 사항은 본 계획의 가정으로 진행하되, 학기 진행 중 변경 필요 시 `/speckit.clarify`로 재확인.
