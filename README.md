# AI 기반 점포 운영 시스템 (mis2601)

> 가맹점주·본사 운영자가 발주·재고·매출·이벤트를 모니터링·제어하는 웹 애플리케이션.

- **Spec**: [specs/001-ai-store-ops/spec.md](./specs/001-ai-store-ops/spec.md)
- **Plan**: [specs/001-ai-store-ops/plan.md](./specs/001-ai-store-ops/plan.md)
- **Tasks**: [specs/001-ai-store-ops/tasks.md](./specs/001-ai-store-ops/tasks.md)
- **Quickstart**: [specs/001-ai-store-ops/quickstart.md](./specs/001-ai-store-ops/quickstart.md)

## Stack

Vue 3 + TypeScript + Vite (frontend) · Express 4 + TypeScript (backend) · MariaDB · Docker + Nginx

## 포트 & 도메인 (고정)

| 항목 | 값 |
|------|-----|
| Frontend dev/preview | **9512** |
| Backend (Express) | **9532** |
| 운영 도메인 | **p12.sumzip.com** (Nginx 80/443 → backend 9532, frontend 9512 또는 정적 빌드) |

## 빠른 시작

```bash
cp .env.example .env       # DB/시크릿 값 채우기
docker compose -f docker/docker-compose.yml up -d mariadb

# Backend  ->  http://localhost:9532
cd backend && npm install && npm run db:migrate && npm run db:seed && npm run dev

# Frontend (별 터미널)  ->  http://localhost:9512
cd frontend && npm install && npm run dev
```

상세는 [quickstart.md](./specs/001-ai-store-ops/quickstart.md) 참조.

## 주요 변경 이력

저장소 메인에서 바로 보이는 핵심 마일스톤 커밋입니다.

| 커밋 | 내용 |
|------|------|
| [`d97901c`](https://github.com/ulos6567/AI-system/commit/d97901c) | AI 인텔리전스·처방형 운영 인사이트 — 처방 루프·대시보드·이상감지·AI 비서·히트맵·예지보전·스케줄러 |
| [`84f8799`](https://github.com/ulos6567/AI-system/commit/84f8799) | 로컬 상생 배송 화면·AI 어시스턴트 게스트 확장·운영 화면 개편 |
| [`561f81d`](https://github.com/ulos6567/AI-system/commit/561f81d) | 운영 화면 실무 용어·정렬·입력 UX 고도화 |

전체 커밋 목록: [Commits on main](https://github.com/ulos6567/AI-system/commits/main)
