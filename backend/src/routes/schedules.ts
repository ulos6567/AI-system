/**
 * 002 (T046) — /api/stores/:storeId/schedules
 *   - GET  /                    스케줄 목록(요약)
 *   - GET  /:id                 스케줄 상세(시프트·위반·예상 인건비)
 *   - POST /generate            주간 초안 자동 생성 (FR-022, FR-023) — 운영자
 *   - POST /:id/confirm         스케줄 확정 (FR-024) + 감사(schedule_confirmed) — 운영자
 *
 *   쓰기(생성/확정)는 001 정책에 따라 requireAdmin (SUPER_ADMIN/HQ_OPERATOR).
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireAdmin, requireStoreScope } from '../middleware/rbac';
import type { SessionUser } from '../middleware/auth/session';
import {
  generateSchedule,
  confirmSchedule,
  getSchedule,
  listSchedules,
} from '../services/scheduler';

const router = Router({ mergeParams: true });

function currentUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, schedules: await listSchedules(storeId) });
});

router.get('/:id', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const schedule = await getSchedule(id, storeId);
  if (!schedule) {
    res.status(404).json({ error: 'schedule_not_found' });
    return;
  }
  res.json({ schedule });
});

const GenerateSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post('/generate', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const parsed = GenerateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const schedule = await generateSchedule(storeId, parsed.data.weekStart);
  res.json({ schedule });
});

router.post('/:id/confirm', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const user = currentUser(req);
  try {
    const schedule = await confirmSchedule(id, storeId, user?.id ?? null);
    res.json({ ok: true, schedule });
  } catch (err: any) {
    if (err.code === 'conflict') {
      res.status(409).json({ error: 'already_confirmed' });
      return;
    }
    if (err.message === 'schedule_not_found') {
      res.status(404).json({ error: 'schedule_not_found' });
      return;
    }
    throw err;
  }
});

export default router;
