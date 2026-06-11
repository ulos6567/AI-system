/**
 * 시재 점검 라우트 — /api/stores/:storeId/cash
 *   GET  /          — 현재 예상 시재 + 점검 이력
 *   POST /counts    — 시재 점검 등록 (관리자)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import type { SessionUser } from '../middleware/auth/session';
import { getStatus, listCounts, createCount } from '../services/cash';

const router = Router({ mergeParams: true });

function currentUserId(req: any): number | null {
  const id = (req.session?.user as SessionUser | undefined)?.id ?? req.jwtUser?.id ?? 0;
  return id && id > 0 ? id : null;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const [status, counts] = await Promise.all([getStatus(storeId), listCounts(storeId, 30)]);
  res.json({ storeId, status, counts });
});

const CreateSchema = z.object({
  shift: z.enum(['open', 'mid', 'close']),
  countedAmount: z.number().min(0).max(100000000),
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
  memo: z.string().max(255).optional(),
});

router.post('/counts', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const userId = currentUserId(req);
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const created = await createCount(storeId, userId, {
    shift: parsed.data.shift,
    countedAmount: parsed.data.countedAmount,
    denominations: parsed.data.denominations ?? null,
    memo: parsed.data.memo ?? null,
  });
  res.status(201).json({ ok: true, count: created, status: created.status });
});

export default router;
