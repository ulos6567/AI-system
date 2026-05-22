/**
 * T034 — /api/stores/{storeId}/orders
 *   GET   /              — 발주 목록
 *   GET   /:id           — 발주 상세 (items 포함)
 *   POST  /auto-generate — 자동 발주 1회 생성
 *   PATCH /:id           — 발주 검토·확정·취소 (status/auto_hold_reason 변경)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { generateAutoOrder, approveAndSend } from '../services/auto-order';
import type { SessionUser } from '../middleware/auth/session';

const router = Router({ mergeParams: true });

function currentUserId(req: any): number {
  return (req.session?.user as SessionUser | undefined)?.id ?? req.jwtUser?.id ?? 0;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const status = (req.query.status as string | undefined) ?? null;
  const pool = getPool();
  const args: any[] = [storeId];
  let where = 'WHERE po.store_id = ?';
  if (status) {
    where += ' AND po.status = ?';
    args.push(status);
  }
  const [rows] = await pool.query<any[]>(
    `SELECT po.id, po.order_date AS orderDate, po.status, po.source,
            po.auto_hold_reason AS autoHoldReason,
            po.sent_at AS sentAt, po.received_at AS receivedAt,
            po.created_at AS createdAt,
            (SELECT COUNT(*) FROM purchase_order_item WHERE purchase_order_id = po.id) AS itemCount
       FROM purchase_order po
       ${where}
      ORDER BY po.created_at DESC
      LIMIT 100`,
    args,
  );
  res.json({ storeId, orders: rows });
});

router.get('/:id', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const pool = getPool();
  const [orders] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, order_date AS orderDate, status, source,
            auto_hold_reason AS autoHoldReason,
            sent_at AS sentAt, received_at AS receivedAt, created_at AS createdAt
       FROM purchase_order WHERE id = ? AND store_id = ?`,
    [id, storeId],
  );
  if (orders.length === 0) {
    res.status(404).json({ error: 'order_not_found' });
    return;
  }
  const [items] = await pool.query<any[]>(
    `SELECT poi.id, poi.product_master_id AS productMasterId,
            pm.name AS productName, pm.category,
            poi.ordered_quantity AS orderedQuantity,
            poi.received_quantity AS receivedQuantity
       FROM purchase_order_item poi
       JOIN product_master pm ON pm.id = poi.product_master_id
      WHERE poi.purchase_order_id = ?`,
    [id],
  );
  res.json({ order: orders[0], items });
});

router.post('/auto-generate', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const userId = currentUserId(req);
  const result = await generateAutoOrder({ storeId, userId, targetDate: req.body?.date ? new Date(req.body.date) : undefined });
  res.json(result);
});

const PatchSchema = z.object({
  action: z.enum(['approve', 'cancel', 'update_quantity']),
  items: z.array(z.object({ id: z.number().int(), orderedQuantity: z.number().int().min(0) })).optional(),
});

router.patch('/:id', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const userId = currentUserId(req);
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const pool = getPool();

  try {
    if (parsed.data.action === 'cancel') {
      await pool.query(
        `UPDATE purchase_order SET status='cancelled' WHERE id = ? AND store_id = ? AND status IN ('draft','pending_review','approved')`,
        [id, storeId],
      );
      await audit({ storeId, userId, eventType: 'order.cancelled', message: `po=${id}` });
      res.json({ ok: true, id, status: 'cancelled' });
      return;
    }
    if (parsed.data.action === 'update_quantity' && parsed.data.items) {
      for (const it of parsed.data.items) {
        await pool.query(
          `UPDATE purchase_order_item SET ordered_quantity = ? WHERE id = ? AND purchase_order_id = ?`,
          [it.orderedQuantity, it.id, id],
        );
      }
      await audit({
        storeId,
        userId,
        eventType: 'order.items_updated',
        message: `po=${id} items=${parsed.data.items.length}`,
        metadata: { items: parsed.data.items },
      });
      res.json({ ok: true, id, updated: parsed.data.items.length });
      return;
    }
    if (parsed.data.action === 'approve') {
      await approveAndSend({ storeId, purchaseOrderId: id, userId });
      res.json({ ok: true, id, status: 'sent' });
      return;
    }
    res.status(400).json({ error: 'unsupported_action' });
  } catch (err: any) {
    res.status(400).json({ error: 'patch_failed', detail: err.message });
  }
});

export default router;
