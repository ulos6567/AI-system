/**
 * 002 (T027) — 이상 징후 라우트
 *   GET  /api/stores/:storeId/anomalies                 이상 이벤트 목록 (?falsePositive=, ?limit=)
 *   GET  /api/stores/:storeId/anomalies/sla             알림 SLA 통계(데모/검증)
 *   POST /api/stores/:storeId/anomalies/simulate        이상 이벤트 즉시 1회 주입(데모) — 운영자
 *   POST /api/stores/:storeId/anomalies/:id/feedback    오탐/대응 결과 기록 + 감사
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import type { SessionUser } from '../middleware/auth/session';
import { listAnomalies, feedbackAnomaly, ingestAnomaly, anomalySlaStats } from '../services/anomaly';
import { generateAnomaly } from '../adapters/anomaly/sim';

const router = Router({ mergeParams: true });

function currentUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const fp = req.query.falsePositive;
  const opts: { limit?: number; falsePositive?: boolean } = {};
  if (req.query.limit) opts.limit = Number(req.query.limit);
  if (fp === 'true') opts.falsePositive = true;
  else if (fp === 'false') opts.falsePositive = false;
  res.json({ storeId, anomalies: await listAnomalies(storeId, opts) });
});

router.get('/sla', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, sla: await anomalySlaStats(storeId) });
});

router.post('/simulate', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const ev = generateAnomaly(storeId);
  const id = await ingestAnomaly(ev);
  res.json({ ok: true, anomalyId: id, event: ev });
});

const FeedbackSchema = z.object({
  falsePositive: z.boolean().optional(),
  resolution: z.string().max(255).optional(),
});

router.post('/:id/feedback', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = FeedbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const user = currentUser(req);
  try {
    await feedbackAnomaly(id, user?.id ?? null, parsed.data);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'anomaly_not_found') {
      res.status(404).json({ error: 'anomaly_not_found' });
      return;
    }
    throw err;
  }
});

export default router;
