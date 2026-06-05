/**
 * 002 (T043) — 장비·예지보전 라우트
 *   GET  /api/stores/:storeId/devices                 장비 목록(상태·최신값·경고 수)
 *   GET  /api/stores/:storeId/devices/:id/health       장비 측정 이력 + 경고
 *   POST /api/stores/:storeId/devices/poll             즉시 폴링·평가(데모) — 운영자
 *   POST /api/stores/:storeId/devices/alerts/:id/ack   경고 확인 + 감사 — 운영자
 */
import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import type { SessionUser } from '../middleware/auth/session';
import {
  listDevices,
  getDeviceHealth,
  evaluateAllDevices,
  ingestReadings,
  acknowledgeAlert,
} from '../services/device-health';

const router = Router({ mergeParams: true });

function currentUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  // 조회 시 평가 보장(빈 화면/오래된 상태 방지)
  await evaluateAllDevices(storeId);
  res.json({ storeId, devices: await listDevices(storeId) });
});

router.get('/:id/health', requireAuth, requireStoreScope(), async (req, res) => {
  const id = Number(req.params.id);
  const health = await getDeviceHealth(id);
  if (!health) {
    res.status(404).json({ error: 'device_not_found' });
    return;
  }
  res.json(health);
});

router.post('/poll', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const ingested = await ingestReadings(storeId);
  const evalRes = await evaluateAllDevices(storeId);
  res.json({ ok: true, ingested, ...evalRes });
});

router.post('/alerts/:id/ack', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const user = currentUser(req);
  try {
    await acknowledgeAlert(id, storeId, user?.id ?? null);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'alert_not_found') {
      res.status(404).json({ error: 'alert_not_found' });
      return;
    }
    throw err;
  }
});

export default router;
