/**
 * 002 (T014) — /api/stores/:storeId/insights
 *   - GET  /signals            운영 신호 목록 (FR-001)
 *   - GET  /actions            처방 액션 목록 (우선순위 정렬, FR-002)
 *   - POST /generate           신호 탐지·처방 생성 즉시 1회 (수동/데모)
 *   - POST /actions/:id/approve 처방 승인·실행 (FR-003, 자동 실행 없음)
 *   - POST /actions/:id/reject  처방 거절 (사유)
 *   - GET  /actions/:id/outcome 처방 효과 검증 리포트 (FR-004)
 *
 *   쓰기(승인/거절/생성)는 001 정책에 따라 requireAdmin (SUPER_ADMIN/HQ_OPERATOR).
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireAdmin, requireStoreScope } from '../middleware/rbac';
import type { SessionUser } from '../middleware/auth/session';
import {
  listSignals,
  listActions,
  generateForStore,
  approveAction,
  rejectAction,
  getOutcome,
  getBriefing,
  getRoi,
  simulateAction,
} from '../services/prescription';

const router = Router({ mergeParams: true });

function currentUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

// 오늘의 운영 브리핑(KPI 헤더) + 처방 효과 ROI 롤업
router.get('/briefing', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const [kpi, roi] = await Promise.all([getBriefing(storeId), getRoi(storeId)]);
  res.json({ storeId, kpi, roi });
});

// 가격 인하 처방 What-if 시뮬레이션 (인하율·기간별 예상 효과)
router.get('/actions/:id/simulate', requireAuth, requireStoreScope(), async (req, res) => {
  const id = Number(req.params.id);
  const percent = Math.min(90, Math.max(1, Number(req.query.percent ?? 20)));
  const durationHours = Math.min(72, Math.max(1, Number(req.query.durationHours ?? 6)));
  res.json({ actionId: id, simulation: await simulateAction(id, percent, durationHours) });
});

router.get('/signals', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ storeId, signals: await listSignals(storeId, status) });
});

router.get('/actions', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ storeId, actions: await listActions(storeId, status) });
});

router.post('/generate', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const r = await generateForStore(storeId);
  res.json({ storeId, ...r });
});

const ApproveSchema = z.object({
  percent: z.number().min(1).max(90).optional(),
  durationHours: z.number().min(1).max(72).optional(),
});

router.post('/actions/:id/approve', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const user = currentUser(req);
  const parsed = ApproveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  try {
    const action = await approveAction(id, user!.id, parsed.data);
    res.json({ ok: true, action });
  } catch (err: any) {
    if (err.code === 'conflict') {
      res.status(409).json({ error: 'action_not_pending' });
      return;
    }
    if (err.message === 'action_not_found') {
      res.status(404).json({ error: 'action_not_found' });
      return;
    }
    throw err;
  }
});

const RejectSchema = z.object({ reason: z.string().min(1).max(255) });

router.post('/actions/:id/reject', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const user = currentUser(req);
  const parsed = RejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  try {
    await rejectAction(id, user!.id, parsed.data.reason);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === 'conflict') {
      res.status(409).json({ error: 'action_not_pending' });
      return;
    }
    if (err.message === 'action_not_found') {
      res.status(404).json({ error: 'action_not_found' });
      return;
    }
    throw err;
  }
});

router.get('/actions/:id/outcome', requireAuth, requireStoreScope(), async (req, res) => {
  const id = Number(req.params.id);
  const outcome = await getOutcome(id);
  if (!outcome) {
    res.status(404).json({ error: 'outcome_not_ready' });
    return;
  }
  res.json({ actionId: id, outcome });
});

export default router;
