# M0 (Phase 1+2) 검증 가이드

> 구현 일자: 2026-05-22 · 범위: T001~T024 (24/79)
> Branch: `001-ai-store-ops`
> 포트·도메인: **Frontend 9512 · Backend 9532 · p12.sumzip.com**

## 0. 사전 준비

```bash
cd /Users/pioneer12/mis2601
cp .env.example .env
# .env 편집 — DB_USER, DB_PASSWORD, SESSION_SECRET, JWT_SECRET 채우기
```

## 1. MariaDB 부팅

```bash
docker compose -f docker/docker-compose.yml up -d mariadb
docker compose -f docker/docker-compose.yml ps        # 'healthy' 확인
```

## 2. Backend 의존성 + 마이그레이션 + 시드

```bash
cd backend
npm install
npm run db:migrate     # _migrations 테이블 + 8개 스키마 + 기본 인덱스 생성
npm run db:seed        # 점포 3곳, 상품 25종, 매핑/재고/거래 + bcrypt 데모 사용자 4명
```

기대 로그:
```
{...} migration applied  filename=001_store_user.sql
{...} migration applied  filename=002_product.sql
... (008까지)
{...} migration run complete  count=8
{...} seed applied  filename=01_demo.sql
{...} seed applied  filename=02_transactions.sql
{...} demo users seeded  count=4 password=demo1234
```

## 3. Backend 부팅 (포트 9532)

```bash
npm run dev
# → backend listening port=9532 env=development
```

검증:

```bash
curl -s http://localhost:9532/api/healthz
# { "status": "ok", "env": "development", "ts": "..." }

# 로그인 (세션 쿠키 저장)
curl -s -c /tmp/c.txt -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"store_owner_demo@example.com","password":"demo1234"}'
# { "user": { "id":..., "email":"store_owner_demo@example.com", "stores":[{"storeId":1,"storeRole":"STORE_OWNER"}], ... } }

# 세션 유지 확인
curl -s -b /tmp/c.txt http://localhost:9532/api/auth/me
# { "user": { ... } }

# 모바일(JWT) 로그인
curl -s -X POST http://localhost:9532/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"hq@example.com","password":"demo1234","client":"mobile"}'
# { "user": { ... }, "token": "eyJ..." }
```

## 4. Frontend 부팅 (포트 9512)

```bash
cd ../frontend
npm install
npm run dev
# Vite dev server: http://localhost:9512 (allowedHosts: p12.sumzip.com)
```

브라우저 `http://localhost:9512` 접속 — "AI 점포 운영 시스템 / Phase 1 부팅 확인 화면" 표시.
> Router/Views는 T035~T039(US1)에서 추가됩니다.

## 5. (옵션) 운영 도메인 시뮬레이션

Nginx 컨테이너까지 띄우려면:

```bash
docker compose -f docker/docker-compose.yml up --build
# nginx :80 → backend:9532 + frontend:9512
# /etc/hosts 에 '127.0.0.1 p12.sumzip.com' 추가하면 http://p12.sumzip.com/ 으로 접근 가능
```

## 6. M0 체크리스트

- [ ] `docker compose ... mariadb` healthy
- [ ] `npm run db:migrate` 8/8 적용 (재실행 시 멱등)
- [ ] `npm run db:seed` 성공 + demo users 4명
- [ ] `curl /api/healthz` 200 OK
- [ ] `POST /api/auth/login` 으로 세션 + JWT 모두 발급 가능
- [ ] `GET /api/auth/me` 가 store_user 매핑까지 포함 응답
- [ ] `event_log` 테이블에 `auth.login` 감사 행 적재됨
- [ ] Frontend `:9512` 부팅, `/api/*` 프록시 백엔드(9532)로 도달
- [ ] Vite/Nginx 모두 `p12.sumzip.com` 호스트 허용

## 7. 다음 단계 (Phase 3 — US1 MVP)

`/speckit.implement` 재실행 후 T025~T039 진행. 구현 골격:
- POS mock + transactions ingest + 외부 신호 폴링
- 상품 매핑/예측/자동 발주 서비스 + 라우터
- 프론트 로그인/AppShell/OrdersView (라우터·Pinia store)
