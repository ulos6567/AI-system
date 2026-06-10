# API Contracts — 003 차세대 편의점 표준 모델

**OpenAPI**: [api.yaml](./api.yaml) (3.0.3)
**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data Model**: [../data-model.md](../data-model.md)

001/002 위에 증분 추가/확장되는 엔드포인트 계약. 인증·권한은 001 RBAC 재사용.

## 엔드포인트 ↔ FR/SC ↔ 유저 스토리

| 그룹 | 경로 | FR | SC | US |
|---|---|---|---|---|
| 표준화 | `GET/POST /mappings/standard`, `GET /mappings/coverage` | FR-001~004 | SC-006 | US1 |
| 셀프 결제 | `POST /transactions/self-checkout`, `GET /transactions/metrics` | FR-005~007 | SC-004 | US2 |
| 오프라인 백업 | `GET /transactions/buffer`, `POST /transactions/buffer/sync` | FR-008~010 | SC-005 | US3 |
| 외부 데이터 | `GET /external/{signalType}` | FR-011~013 | SC-001/003 | US4 |
| KPI | `GET /dashboard/kpi` | FR-014~015 | SC-001~007 | US5 |
| 거버넌스 | `GET /consent`, `GET /consent/check` | FR-007, FR-016~017 | SC-007 | 횡단 |

## 계약 규칙

- **추정 매핑 금지(FR-002)**: `MappingUpsert.standardCode=null`은 "미매핑" 명시. 서버가 임의 추정 채움 금지(422).
- **멱등(FR-009/010)**: 셀프 결제·버퍼는 `idempotencyKey` 필수. 중복은 409 또는 sync에서 skip 집계.
- **거버넌스 게이트(FR-007/016/017)**: 결제·분석·영상 경로는 `consent/check` 통과 필수. 미확보 403.
- **외부 폴백(FR-013)**: `ExternalSignalResponse.available=false` + `fallback` 사유 제공.
- **KPI 단일 소스(FR-014)**: `/dashboard/kpi`는 `kpi_snapshot` 단일 집계를 노출.

## 검증

- 구현 단계에서 본 계약 기반 통합 테스트(tasks T014/T020/T025/T031/T036) 수행.
- OpenAPI 일관성 점검: tasks T039.
