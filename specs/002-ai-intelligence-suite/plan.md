# Implementation Plan: AI 인텔리전스·처방형 운영 인사이트

**Branch**: `002-ai-intelligence-suite`
**Spec**: [spec.md](./spec.md)
**Base**: 001-ai-store-ops (기존 플랫폼 위에 증분 구현)
**Created**: 2026-06-05
**Status**: Phase 0~1 Complete · Ready for `/speckit.tasks`

---

## Summary

`spec.md`의 27개 기능 요구사항(FR-001~027)과 13개 성공 기준(SC-001~013)을 충족하는 **인텔리전스·처방형 운영 계층**을 001 플랫폼 위에 증분 구축한다. 001의 거래·자동화 데이터(POS·재고·예측·가격·발주)를 입력으로 받아 **"신호 탐지 → 처방 생성 → 점주 승인 실행 → 효과 자동 검증"**의 닫힌 루프를 더하고, Vision/이상감지/IoT 분석(시뮬레이션 데이터), LLM 경영비서(실제 외부 LLM), 인력 스케줄러를 추가한다.

Clarify 단계 결정 3건이 본 계획의 핵심 경계를 정한다:

1. **Vision AI·이상감지·IoT 예지보전은 시뮬레이션/데모 데이터로 동작** — 기존 포트·어댑터 패턴을 그대로 활용해 시뮬레이션 어댑터를 구현하고, 실제 연동은 표준 입력 인터페이스(포트) 정의로 대체.
2. **AI 경영비서는 실제 외부 LLM API 연동(RAG식)** — 플랫폼 데이터를 근거 컨텍스트로 주입, 새로운 `llm` 포트 추가.
3. **처방은 항상 점주 승인 필수** — 자동 실행 경로 없음. 모든 처방은 `proposed` 상태로 생성되고 승인 시에만 001의 가격/발주 실행 경로를 호출.

---

## Technical Context

001과 동일 스택을 재사용한다(신규 스택 도입 없음).

| 항목 | 결정 | 출처/근거 |
|------|------|----------|
| **언어/런타임** | Node.js 20 LTS + TypeScript 5.x | 001 재사용 |
| **프론트엔드** | Vue.js 3 (Composition API) + Pinia + Vite | 001 재사용 |
| **백엔드** | Express.js + TypeScript, 포트·어댑터 구조 | 001 재사용 (`backend/src/ports`, `adapters`) |
| **DB** | MariaDB (mysql2) | 001 재사용, 신규 테이블 증분 마이그레이션 |
| **실시간** | SSE(`events.stream.ts`) 재사용 | 이상 알림·처방 알림 |
| **차트/시각화** | 프론트 차트 컴포넌트(클라이언트 렌더) | FR-007 대시보드·히트맵 |
| **LLM 연동** | 외부 LLM API (신규 `llm` 포트 + 어댑터) | spec FR-019 (Clarify) |
| **인증/권한** | 001 RBAC 재사용 (`middleware/rbac.ts`) | FR-025 |
| **테스트** | Vitest(프론트) + 백엔드 통합 테스트 | 001 재사용 |
| **로깅·감사** | 구조화 로그 + `event_log` 감사 테이블 확장 | FR-027 |
| **시크릿** | `.env`(LLM API 키 포함) 평문 금지 | 보안 |

### 외부 통합 — 포트·어댑터 (시뮬레이션 우선)

기존 `backend/src/ports/*`, `backend/src/adapters/*` 패턴을 따른다.

| 포트 | 신규/확장 | 1차 구현 | 후속 단계 |
|------|----------|---------|----------|
| `vision`(기존) | 확장 | 시뮬레이션 동선·행동 이벤트 재생 → 히트맵/행동 집계 | 실제 Vision AI |
| `anomaly`(신규) | 신규 | 시뮬레이션 이상 이벤트 발생기(미결제·소란·쓰러짐·침입) | 실제 영상 분석 |
| `iot`(신규) | 신규 | 시뮬레이션 센서 스트림(온도·전력) + 임계/추세 룰 | 실제 IoT 게이트웨이 |
| `llm`(신규) | 신규 | **실제 외부 LLM API** + RAG 컨텍스트 빌더 | 모델 교체·자체 호스팅 |
| `push`(기존) | 재사용 | 이상/처방 알림 발송 | FCM·APNs |

---

## Constitution Check

프로젝트에 `.specify/memory/constitution.md`가 없으므로 001과 동일한 **기본 원칙**을 채택한다.

| 원칙 | 본 계획 준수 |
|------|-------------|
| 명세 우선 | ✅ spec.md(+Clarifications) source of truth |
| 비밀정보 비노출 | ✅ LLM API 키 등 `.env` 분리, 문서·코드 평문 금지 |
| 테스트 가능성 | ✅ 각 FR이 자동/수동 검증 가능, 처방 승인 흐름 통합 테스트 |
| 가역적 의사결정 | ✅ vision/anomaly/iot/llm 전부 포트 격리, 교체 가능 |
| 점진적 도입 | ✅ 분석 3종 시뮬레이션 → 실연동 후속 |
| 데이터 최소 수집 | ✅ 영상 분석 비식별만, LLM 전송 데이터 비식별화(FR-026) |
| 안전 기본값 | ✅ 처방 자동 실행 없음, 점주 승인 필수(FR-003) |

→ **게이트 통과**. 위반 없음.

---

## Project Structure

```
specs/002-ai-intelligence-suite/
├── spec.md                    # 명세 + Clarifications (완료)
├── plan.md                    # 본 문서
├── research.md                # Phase 0 산출물
├── data-model.md              # Phase 1: 신규 테이블 스키마
├── quickstart.md              # Phase 1: 개발·검증 가이드
├── contracts/
│   ├── api.yaml               # OpenAPI 3.0 (신규 엔드포인트)
│   └── README.md
└── checklists/
    └── requirements.md        # 명세 품질 체크리스트

backend/src/                   # 기존 구조에 증분 추가
├── ports/
│   ├── anomaly.ts             # (신규) 이상 이벤트 입력 포트
│   ├── iot.ts                 # (신규) 센서 스트림 포트
│   └── llm.ts                 # (신규) LLM 포트
├── adapters/
│   ├── anomaly/               # (신규) 시뮬레이션 어댑터
│   ├── iot/                   # (신규) 시뮬레이션 어댑터
│   ├── llm/                   # (신규) 실제 LLM 어댑터
│   └── vision/                # (확장) 히트맵·행동 집계
├── services/
│   ├── signal-detect.ts       # (신규) 운영 신호 탐지
│   ├── prescription.ts        # (신규) 처방 생성·승인·검증
│   ├── analytics.ts           # (신규) 히트맵·행동 인사이트
│   ├── anomaly.ts             # (신규) 이상 이벤트 처리
│   ├── device-health.ts       # (신규) 예지보전
│   ├── assistant.ts           # (신규) LLM 비서 오케스트레이션(RAG)
│   └── scheduler.ts           # (신규) 인력 스케줄 최적화
├── routes/
│   ├── insights.ts            # (신규) /api/insights/signals, /actions
│   ├── analytics.ts           # (신규) /api/analytics/*
│   ├── anomalies.ts           # (신규) /api/anomalies/*
│   ├── devices.ts             # (신규) /api/devices/*
│   ├── assistant.ts           # (신규) /api/assistant/*
│   └── schedules.ts           # (신규) /api/schedules/*
├── jobs/
│   ├── signal-detect.ts       # (신규) 주기적 신호 탐지·처방 생성
│   ├── action-verify.ts       # (신규) 처방 효과 검증(closed-loop)
│   ├── device-monitor.ts      # (신규) 센서 임계/추세 감시
│   └── anomaly-sim.ts         # (신규) 시뮬레이션 이상 이벤트 주입
└── db/
    └── migrate.ts             # 신규 테이블 마이그레이션 추가

frontend/src/                  # 기존 구조에 증분 추가
├── views/
│   ├── InsightsView.vue       # (신규) 처방 액션 카드·신호
│   ├── AnalyticsView.vue      # (신규) 히트맵·행동 분석
│   ├── AnomaliesView.vue      # (신규) 이상 이벤트
│   ├── DevicesView.vue        # (신규) 장비 상태·예지보전
│   ├── AssistantView.vue      # (신규) AI 비서 챗
│   └── ScheduleView.vue       # (신규) 인력 스케줄러
├── stores/                    # 각 화면별 Pinia 스토어
└── api/                       # 신규 엔드포인트 래퍼
```

---

## Phase 0: Outline & Research

→ 산출물: [research.md](./research.md)

핵심 의사결정 요약:

1. **처방 실행 경로** — 처방은 `proposed`로 생성, 승인 시 001의 기존 `pricing`/`auto-order` 서비스를 호출(재사용). 자동 실행 경로 없음.
2. **효과 검증(closed-loop)** — 처방 실행 시점의 베이스라인 스냅샷 저장 → 검증 기간 후 실제 지표 비교. 검증 결과를 추천 가중치에 반영(단순 피드백 루프).
3. **LLM 연동(RAG)** — 자연어 질의 → 의도 분류 → 플랫폼 데이터 조회 → 근거 컨텍스트 구성 → LLM 호출 → 근거 출처 동반 응답. 환각 억제: 근거 없으면 "데이터 없음" 응답.
4. **시뮬레이션 데이터 공급** — vision/anomaly/iot는 시드 + 잡(job) 기반 시뮬레이터로 데이터 생성. 포트 인터페이스는 실연동과 동일 형태.
5. **히트맵 시각화** — 매대 그리드 × 체류 가중치 집계를 클라이언트에서 렌더.
6. **인력 스케줄러** — 시간대별 수요 예측 → 필요 인원 산정 → 가용성·법정 제약(휴게·연속근무) 충족 시프트 배정(휴리스틱/그리디). 제약 위반 시 명시.
7. **개인정보·LLM** — 분석은 비식별 집계만, LLM 전송 데이터에서 개인 식별자 제거.

---

## Phase 1: Design & Contracts

### Data Model

→ 산출물: [data-model.md](./data-model.md)

spec.md의 9개 신규 Key Entity를 MariaDB 스키마로 매핑(약 12개 신규 테이블). 핵심:

- `operational_signal`
- `prescriptive_action`, `action_outcome`
- `behavior_insight`(히트맵·선호 집계), 기존 `customer_behavior_event` 활용
- `anomaly_event`
- `device`, `device_reading`, `maintenance_alert`
- `assistant_conversation`, `assistant_message`
- `work_schedule`, `work_shift`, `employee`
- `product_media`

### API Contracts

→ 산출물: [contracts/api.yaml](./contracts/api.yaml) (OpenAPI 3.0)

| 그룹 | 경로 | 주요 동작 |
|------|------|---------|
| 인사이트 | `/api/insights/signals`, `/api/insights/actions` | 신호 조회, 처방 조회·승인·수정·거절 |
| 처방 검증 | `/api/insights/actions/{id}/outcome` | 효과 검증 리포트 |
| 분석 | `/api/analytics/heatmap`, `/api/analytics/behavior` | 히트맵·행동 통계 |
| 이상 | `/api/anomalies`, `/api/anomalies/{id}` | 이벤트 조회·오탐 피드백 |
| 장비 | `/api/devices`, `/api/devices/{id}/health` | 상태·예지보전 경고 |
| 비서 | `/api/assistant/conversations`, `/messages` | 질의·응답(근거 포함) |
| 스케줄 | `/api/schedules`, `/api/schedules/generate` | 초안 생성·수정·확정 |
| 상품 미디어 | `/api/products/{id}/media` | 이미지 메타 조회 |

### Quickstart

→ 산출물: [quickstart.md](./quickstart.md)

---

## Phase 2: Task Planning Approach

> 본 단계는 `/speckit.tasks`에서 산출한다. 분해 원칙(미리 정의):

1. **수직 슬라이스 우선** — 처방형 액션(신호→카드→승인→검증)을 end-to-end로 먼저, 이후 분석·이상·IoT·비서·스케줄러 확장.
2. **계층 순서** — DB 마이그레이션 → 포트/어댑터(시뮬레이션) → 서비스 → 라우트 → 잡 → 프론트 화면 → 검증.
3. **001 재사용 우선** — 처방 실행은 기존 pricing/auto-order, 알림은 기존 push/SSE 재사용.
4. **테스트 동반** — 처방 승인 흐름·검증 루프·LLM 근거 동반 응답에 통합 테스트.

---

## Post-Design Constitution Re-Check

| 원칙 | 재검토 |
|------|--------|
| 비밀정보 비노출 | ✅ contracts·data-model에 자격증명 없음, LLM 키 `.env` |
| 가역성 | ✅ vision/anomaly/iot/llm 포트 격리 |
| 테스트 가능성 | ✅ api.yaml 기반 계약 테스트, 처방 흐름 검증 |
| 데이터 최소 수집 | ✅ 비식별 집계, LLM 전송 비식별화 |
| 안전 기본값 | ✅ 처방 자동 실행 없음 |
| 명세 일치 | ✅ FR-001~027 ↔ 엔드포인트/테이블 매핑 가능 |

→ **재검토 통과**. `/speckit.tasks` 진행 가능.

---

## Complexity Tracking

| 항목 | 복잡도 | 대응 |
|------|--------|------|
| LLM RAG 오케스트레이션·환각 억제 | 高 | 의도 분류 + 근거 강제 + "데이터 없음" 폴백 |
| 처방 효과 검증(closed-loop) | 中 | 실행 시 베이스라인 스냅샷 → 기간 후 비교 |
| 시뮬레이션 데이터 현실성 | 中 | 시드 + 잡 기반 시뮬레이터, 날짜 상대 생성 |
| 인력 스케줄러 제약 충족 | 中 | 휴리스틱 + 제약 위반 명시(완전 최적화는 후속) |
| 히트맵 시각화 | 低 | 매대 그리드 가중치 클라이언트 렌더 |
| 실제 Vision/IoT 하드웨어 | 高 | **1차 범위 제외**(시뮬레이션, 포트만 정의) |

---

## Open Questions / Deferred

1. 인력 스케줄러의 구체적 법정 근로 규칙(휴게·연속근무 한도) 파라미터화 범위 — plan 가정: 기본 규칙 셋 제공, 점포별 커스텀은 후속.
2. LLM 제공자 선택(모델·비용) — `llm` 포트로 추상화하여 구현 단계에서 결정.
3. 처방 추천 가중치 학습 정도 — 1차는 단순 규칙 기반 피드백, 본격 ML은 후속.
