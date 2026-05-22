/**
 * T042 — GET /api/stores/:storeId/events/stream — SSE 채널 구독
 *
 *   2개 채널 동시 구독:
 *     store:<storeId> — 점포 단위 이벤트
 *     user:<userId>   — 개인 알림(notification)
 *
 *   인증: 세션 쿠키 또는 JWT(Bearer). EventSource 는 헤더 지정이 까다로워
 *         쿠키 세션 경로가 기본이다.
 *   Nginx 가 앞단에 있을 경우 `proxy_buffering off` 필수 (docker/nginx/default.conf).
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getEventBus } from '../lib/sse';
import type { SessionUser } from '../middleware/auth/session';

const router = Router({ mergeParams: true });

router.get('/stream', requireAuth, requireStoreScope(), (req, res) => {
  const bus = getEventBus();
  const storeId = Number(req.params.storeId);
  const user = (req.session?.user as SessionUser | undefined) ?? (req as any).jwtUser;

  bus.subscribe(`store:${storeId}`, req, res);
  if (user?.id) {
    bus.subscribe(`user:${user.id}`, req, res);
  }
});

export default router;
