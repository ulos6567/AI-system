# Quickstart

**Feature**: AI 기반 점포 운영 시스템
**Stack**: Vue.js 3 + Node.js/Express + MariaDB + Docker

본 가이드는 로컬 개발 환경을 구동하기 위한 최소 절차다. 자세한 의사결정은 [plan.md](./plan.md), [research.md](./research.md) 참조.

---

## 0. 사전 요구사항

- Node.js **20 LTS** 이상
- npm 10 이상 (또는 pnpm)
- Docker Desktop (MariaDB 컨테이너용)
- Git
- 권장 에디터: VS Code (Volar, ESLint, EditorConfig 확장)

> ⚠️ **macOS 사용 시 Homebrew mysql 클라이언트 사용 금지.** MariaDB는 Docker 컨테이너 또는 mysql2 드라이버를 통해서만 접근.

---

## 1. 저장소 클론 & 환경변수

```bash
git clone <repo>
cd <repo>
cp .env.example .env
# .env 편집: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, SESSION_SECRET 등 입력
```

`.env.example` (저장소에 커밋, 값 없음):

```dotenv
# Database (실제 값은 별도 전달 — .env에만 기입, 커밋 금지)
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

# Server
PORT=3000
SESSION_SECRET=
NODE_ENV=development

# External adapters (mock by default)
ADAPTER_POS=mock
ADAPTER_FORECAST=baseline
ADAPTER_PUSH=mock
ADAPTER_ESL=mock
ADAPTER_LOGISTICS=mock
```

> 🔒 **`.env`는 `.gitignore`에 등록 필수.** DB 비밀번호·세션 시크릿 등 비밀정보는 코드·문서·커밋에 평문으로 남기지 말 것.

---

## 2. 데이터베이스 준비

### 옵션 A — 로컬 Docker MariaDB

```bash
docker compose -f docker/docker-compose.yml up -d mariadb
```

### 옵션 B — 팀 공용 MariaDB

`Intent-Plan.md`에 명시된 팀 공용 DB 접속 정보를 사용. **자격증명은 채널 외 공유로만 받고 `.env`에만 저장.**

### 마이그레이션 & 시드

```bash
cd backend
npm install
npm run db:migrate     # db/migrations/*.sql 순차 실행
npm run db:seed        # db/seeds/*.sql 데모 데이터 적재
```

---

## 3. 백엔드 실행

```bash
cd backend
npm run dev            # ts-node + nodemon (포트 3000)
npm test               # jest + supertest
npm run lint
```

기본 진입:
- API: `http://localhost:3000/api`
- OpenAPI 정적 노출: `http://localhost:3000/api/docs` (개발 모드만)
- 헬스체크: `GET /api/healthz`

---

## 4. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev            # vite (포트 5173)
npm test               # vitest
```

기본 진입: `http://localhost:5173`

Vite dev 서버는 `/api/*` 요청을 `http://localhost:3000`으로 프록시한다(`vite.config.ts`).

---

## 5. 데모 시나리오 (수동 검증)

| 단계 | 동작 | 기대 결과 |
|------|------|----------|
| 1 | `store_owner_demo@example.com` 로 로그인 | 점주 대시보드 진입 |
| 2 | 좌측 메뉴 "발주" → "내일자 예측 보기" | 품목별 예측 수량 표시 |
| 3 | "자동 발주 생성" 버튼 | `purchase_order.status='approved'` 또는 `pending_review` |
| 4 | 좌측 메뉴 "재고" → 유통기한 임박 필터 | 임박 상품 + 자동 가격 할인 적용 이력 |
| 5 | 별도 탭 "이벤트" | SSE 스트림 카드가 실시간 갱신 |
| 6 | 셀프 결제 모의 화면 → 상품 스캔 | 거래 즉시 생성, 재고 차감 |
| 7 | 좌측 메뉴 "리포트 → 일간" | 폐기율·매출·MAPE 표시 |

---

## 6. 외부 어댑터 전환

`.env`의 `ADAPTER_*` 변수를 `mock` → `real`로 변경하면 어댑터가 실제 외부 서비스로 호출 전환.

| 변수 | mock 동작 | real 동작(후속) |
|------|-----------|----------------|
| ADAPTER_POS | 시드 데이터 재생 | 토스플레이스/나이스 연동 |
| ADAPTER_FORECAST | 이동평균 베이스라인 | Python 추론 서비스 |
| ADAPTER_PUSH | 콘솔·DB 로그 | FCM/APNs |
| ADAPTER_ESL | DB 로그 | ESL 벤더 API |
| ADAPTER_LOGISTICS | CSV 응답 | 물류사 EDI/REST |

---

## 7. Docker 전체 스택 실행 (스테이징 유사)

```bash
docker compose -f docker/docker-compose.yml up --build
```

서비스:
- `frontend` (Nginx + 빌드된 정적 파일, 80)
- `backend` (Node + Express, 3000)
- `mariadb` (3306, 내부 네트워크 전용)
- `nginx` (리버스 프록시 + SSL 종단, 443)

---

## 8. 트러블슈팅

| 증상 | 점검 |
|------|------|
| 백엔드 시작 시 `ECONNREFUSED` | MariaDB 컨테이너 상태, `.env` DB_HOST/포트 확인 |
| 로그인 후 즉시 401 | `SESSION_SECRET` 누락, 쿠키 SameSite 설정 |
| 이벤트 스트림 끊김 | Nginx `proxy_buffering off`, `proxy_read_timeout` 확인 |
| 매핑 신뢰도가 항상 낮음 | `product_master` 시드 누락, 임계치 조정 |
| 자동 발주가 매번 보류 | `auto_hold_reason` 로그 확인(과거 평균 N배 기준 검토) |

---

## 9. 다음 단계

- `/speckit.tasks` — plan.md를 작업 단위로 분해
- `/speckit.implement` — 작업 순차 실행
- `/speckit.clarify` — plan.md의 Open Questions 명료화
