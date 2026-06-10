# Project Constitution — mis2601 (AI 점포 운영 플랫폼)

**Version**: 1.0.0
**Ratified**: 2026-06-10
**Scope**: 001-ai-store-ops, 002-ai-intelligence-suite, 003-next-gen-cvs-standard 및 이후 모든 기능

본 문서는 mis2601 전 기능에 적용되는 **비협상(non-negotiable) 원칙**을 정의한다. `/speckit.analyze`는 본 원칙 위반을 자동 CRITICAL로 처리한다. 원칙 변경은 별도의 명시적 constitution 업데이트로만 가능하다.

---

## Principle 1 — 명세 우선 (Spec-First)
모든 기능은 `spec.md`(요구사항 source of truth)를 가지며, plan·tasks·구현은 spec과 추적 가능하게 정합한다. spec 없는 구현은 금지한다.
- **MUST**: FR/SC ↔ 태스크 ↔ 구현 매핑이 가능해야 한다.

## Principle 2 — 비밀정보 비노출 (No Secrets in Repo)
자격증명·API 키·토큰은 코드·문서·계약(contracts)에 평문으로 두지 않는다.
- **MUST**: 모든 시크릿은 `.env`(또는 시크릿 매니저)로 분리한다.

## Principle 3 — 테스트 가능성 (Testability)
모든 요구사항은 자동 또는 수동으로 검증 가능해야 하며, 성공 기준(SC)은 측정 가능해야 한다.
- **MUST**: 각 SC는 정량·검증 가능한 형태로 기술한다.

## Principle 4 — 가역적 의사결정 (Reversible by Ports)
외부 의존(예측·영상·IoT·LLM·외부데이터)은 **포트·어댑터**로 격리해 교체 가능하게 둔다.
- **MUST**: 외부 통합은 포트 인터페이스 뒤에 둔다. 시뮬레이션→실연동 교체가 명세 변경 없이 가능해야 한다.

## Principle 5 — 점진적 도입 (Incremental Delivery)
큰 기능은 독립 검증 가능한 수직 슬라이스로 분해하고, 시뮬레이션 우선으로 단계 적용한다.
- **SHOULD**: MVP(최우선 스토리) → 증분 확장 순으로 인도한다.

## Principle 6 — 데이터 최소 수집 (Data Minimization)
고객 데이터는 목적에 필요한 최소만, 비식별·집계 형태로 처리한다.
- **MUST**: 영상·행동 데이터는 비식별 집계만, 동의 미확보 데이터는 수집하지 않는다.

## Principle 7 — 안전 기본값 (Safe Defaults)
장애·불확실 상황의 기본 동작은 안전 측으로 한다.
- **MUST**: 처방·자동 실행은 점주 승인 없이 실행하지 않는다(002). 장애 시 결제는 안전한 백업 경로로 연속성을 유지한다(003).

---

## Governance
- 본 원칙과 충돌하는 spec/plan/tasks는 **원칙이 아니라 산출물을 조정**해 해소한다.
- 원칙 자체의 변경은 버전 증가와 함께 본 문서에서만 수행한다.
