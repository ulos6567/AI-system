/**
 * 캠퍼스 캘린더 라우트 — /api/stores/:storeId/campus
 *   GET  /universities    — 점포 인근 대학 + 현재 상태(축제/시험/방학)
 *   GET  /calendar        — 학사 일정(축제·시험·방학) 목록 + 진행 상태
 *   GET  /recommendations — 진행중·임박 일정 기반 이벤트·재고 추천(플레이)
 *   POST /promote         — 이벤트(프로모션) 추진 → event_log 적재  (관리자)
 *   PATCH /inventory      — 추천 재고 수량 일괄 수정                (관리자)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import type { SessionUser } from '../middleware/auth/session';
import { listUniversities, listCalendar, buildRecommendations } from '../services/campus';

const router = Router({ mergeParams: true });

function currentUserId(req: any): number {
  return (req.session?.user as SessionUser | undefined)?.id ?? req.jwtUser?.id ?? 0;
}

router.get('/universities', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const universities = await listUniversities(storeId);
  res.json({ storeId, universities });
});

router.get('/calendar', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const events = await listCalendar(storeId);
  const summary = {
    total: events.length,
    activeFestival: events.filter((e) => e.status === 'active' && e.eventType === 'festival').length,
    activeExam: events.filter((e) => e.status === 'active' && e.eventType === 'exam').length,
    upcoming: events.filter((e) => e.status === 'upcoming').length,
  };
  res.json({ storeId, summary, events });
});

router.get('/recommendations', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  // 지역 필터로 특정 대학을 보는 경우: universityIds=1,2,3 (최대 25개)
  const raw = String(req.query.universityIds ?? '').trim();
  const universityIds = raw
    ? raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, 25)
    : [];
  const plays = await buildRecommendations(storeId, universityIds.length ? { universityIds } : undefined);
  res.json({ storeId, scope: universityIds.length ? 'filtered' : 'nearby', plays });
});

const PromoteSchema = z.object({
  academicEventId: z.number().int().positive(),
  label: z.string().min(1).max(128),
  categories: z.array(z.string().min(1)).min(1),
  discountPct: z.number().min(0).max(90),
  startDate: z.string().min(8).max(10),
  endDate: z.string().min(8).max(10),
  // 상세 추진안(있으면 이벤트로그에 함께 적재) — 표시·기록용
  mechanic: z.string().max(200).optional(),
  bundles: z.array(z.string().min(1)).max(20).optional(),
  channels: z.array(z.string().min(1)).max(20).optional(),
  expectedUpliftPct: z.number().min(-100).max(500).optional(),
});

router.post('/promote', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const userId = currentUserId(req);
  const parsed = PromoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  const eventLogId = await audit({
    storeId,
    userId,
    severity: 'info',
    eventType: 'campus.promotion_launched',
    message: `${p.label} (${p.discountPct}% / ${p.categories.join(',')})${p.mechanic ? ` — ${p.mechanic}` : ''}`,
    metadata: {
      academicEventId: p.academicEventId,
      label: p.label,
      categories: p.categories,
      discountPct: p.discountPct,
      startDate: p.startDate,
      endDate: p.endDate,
      mechanic: p.mechanic ?? null,
      bundles: p.bundles ?? null,
      channels: p.channels ?? null,
      expectedUpliftPct: p.expectedUpliftPct ?? null,
    },
  });
  res.status(201).json({ ok: true, eventLogId, promotion: p });
});

const InventoryAdjustSchema = z.object({
  reason: z.string().max(128).optional(),
  academicEventId: z.number().int().positive().optional(),
  adjustments: z
    .array(
      z.object({
        inventoryId: z.number().int().positive(),
        quantity: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
});

router.patch('/inventory', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const userId = currentUserId(req);
  const parsed = InventoryAdjustSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const { adjustments } = parsed.data;
  const pool = getPool();
  const conn = await pool.getConnection();
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (const a of adjustments) {
      const [rows] = await conn.query<any[]>(
        `SELECT id, product_master_id, quantity FROM inventory WHERE id = ? AND store_id = ?`,
        [a.inventoryId, storeId],
      );
      if (rows.length === 0) continue;
      const cur = rows[0];
      const delta = a.quantity - Number(cur.quantity);
      if (delta === 0) continue;
      await conn.query(`UPDATE inventory SET quantity = ? WHERE id = ?`, [a.quantity, a.inventoryId]);
      await conn.query(
        `INSERT INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at)
         VALUES (?, ?, ?, 'adjust', NOW())`,
        [storeId, cur.product_master_id, delta],
      );
      updated += 1;
    }
    await conn.commit();
  } catch (err: any) {
    await conn.rollback();
    res.status(400).json({ error: 'adjust_failed', detail: err.message });
    return;
  } finally {
    conn.release();
  }

  await audit({
    storeId,
    userId,
    severity: 'info',
    eventType: 'campus.inventory_adjusted',
    message: `${parsed.data.reason ?? '캠퍼스 수요 대응'} — ${updated}개 품목 재고 수정`,
    metadata: {
      academicEventId: parsed.data.academicEventId ?? null,
      reason: parsed.data.reason ?? null,
      count: updated,
    },
  });
  res.json({ ok: true, updated });
});

export default router;
