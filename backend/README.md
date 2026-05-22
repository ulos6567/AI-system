# Backend — Express 4 + TypeScript

```bash
npm install
npm run db:migrate       # db/migrations/*.sql 순차 실행
npm run db:seed          # db/seeds/*.sql 적재 + bcrypt로 데모 사용자 생성
npm run dev              # http://localhost:9532  (헬스: /api/healthz)
npm test                 # jest + supertest
npm run lint
```

- 포트: **9532** (고정, `.env` 의 `PORT`)
- 운영 도메인: `p12.sumzip.com` (Nginx 리버스 프록시가 `/api/*` → 9532)
- CORS: 개발은 `localhost:9512`, 운영은 `https://p12.sumzip.com` 만 허용

## 환경변수

`.env.example` 참조. 모든 값은 저장소 루트 `.env`에서 로드(`dotenv`).

## 모듈 구조

- `src/routes/` — REST 라우터 (auth, stores, orders, …)
- `src/services/` — 비즈니스 로직
- `src/adapters/` — POS·외부데이터·AI·ESL·푸시·물류 어댑터 (mock + real)
- `src/ports/` — 어댑터 추상 인터페이스(헥사고날, R-004)
- `src/db/` — mysql2 pool, 마이그레이션 러너
- `src/middleware/` — 인증·RBAC·로깅·에러
- `src/lib/` — logger, audit, sse 헬퍼
- `src/jobs/` — 스케줄러
