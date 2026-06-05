# Quickstart — 002 AI Intelligence Suite

**Feature**: AI 인텔리전스·처방형 운영 인사이트
**Plan**: [plan.md](./plan.md)

001 플랫폼 위에 증분 구현되므로 기존 개발 환경을 그대로 사용한다.

## 사전 요건

- 001 환경이 동작 중일 것 (프론트 9512 / 백엔드 9532, `p12.sumzip.com`)
- Node.js 20 LTS, MariaDB 실행
- `.env`에 신규 변수 추가:
  ```
  LLM_API_KEY=...           # 외부 LLM (평문 커밋 금지)
  LLM_API_BASE=...          # 선택
  LLM_MODEL=...             # 선택
  ```

## 설치·실행

```bash
# 1) 의존성 (신규 패키지가 있으면)
cd backend && npm install
cd ../frontend && npm install

# 2) DB 마이그레이션 (002 신규 테이블 포함)
cd ../backend && npm run db:migrate

# 3) 데모 데이터 시드 (시뮬레이션 vision/anomaly/iot 포함, 날짜 상대 생성)
npm run db:seed:demo

# 4) 백엔드 / 프론트 기동 (001과 동일)
npm run dev            # backend :9532
cd ../frontend && npm run dev   # frontend :9512
```

## 동작 검증 (FR ↔ 화면)

| 검증 | 경로 | 기대 |
|------|------|------|
| 처방 카드 표시·승인 | `/insights` → 액션 카드 '실행' | 승인 후 가격/발주 적용, status=executed |
| 처방 효과 검증 | 검증 기간 경과 후 outcome | 예상 vs 실제 비교 표출 |
| 히트맵 | `/analytics` | 매대 색상 히트맵 + 개선 제안 |
| 이상 알림 | `/anomalies` (시뮬레이터 주입) | 30초 내 SSE 알림·이벤트 목록 |
| 예지보전 | `/devices` | 온도 이상 추세 시 경고 |
| AI 비서 | `/assistant` "오늘 제일 많이 팔린 상품?" | 근거 동반 답변, 근거 없으면 "데이터 없음" |
| 인력 스케줄 | `/schedule` → 생성 | 시프트 초안 + 예상 인건비, 제약 위반 명시 |
| 상품 이미지 | 상품 화면 | 실제/대체 이미지 100% 표출 |

## 자동 테스트

```bash
cd backend && npm test       # 처방 흐름·검증 루프·LLM 근거 동반 통합 테스트
cd ../frontend && npm run test:unit   # 신규 뷰 컴포넌트
```

## 시뮬레이터 동작

- `jobs/anomaly-sim.ts`, `jobs/device-monitor.ts`, vision 시뮬레이션 어댑터가 주기적으로 데이터를 생성한다.
- 데모 데이터가 오래되면 `npm run db:seed:demo` 재실행(날짜 상대 생성).

## 안전·컴플라이언스 체크

- 처방은 승인 없이 실행되지 않는다(자동 실행 경로 부재).
- LLM 전송 컨텍스트에 개인 식별자가 포함되지 않는다.
- 모든 처방 승인/AI 응답/이상 대응은 `event_log`에 감사 기록된다.
