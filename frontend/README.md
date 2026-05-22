# Frontend — Vue 3 + Vite

```bash
npm install
npm run dev      # http://localhost:9512  (외부 도메인: https://p12.sumzip.com)
npm run build
npm run lint
npm test
```

- 포트: **9512** (고정, `vite.config.ts` strictPort)
- `/api/*` 요청은 vite dev 서버가 `http://localhost:9532` (백엔드)로 프록시합니다.
- 운영 도메인: `p12.sumzip.com` — Nginx가 `:80/:443` 에서 정적 파일과 `/api`를 백엔드(9532)로 라우팅합니다.
