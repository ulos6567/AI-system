/**
 * T067 — 상품 매핑 검토 라우터 (FR-004)
 *   GET   /api/stores/:storeId/product-mappings              — 전체 + status 필터
 *   PATCH /api/stores/:storeId/product-mappings/:id          — confirm/reject/reassign
 *   POST  /api/stores/:storeId/product-mappings/auto-rerun   — 미해소 항목 재매핑 시도
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { upsertMapping } from '../services/product-mapping';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const status = (req.query.status as string | undefined) ?? null;
  const args: any[] = [storeId];
  let where = 'WHERE plm.store_id = ?';
  if (status) {
    where += ' AND plm.status = ?';
    args.push(status);
  }
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT plm.id, plm.local_code AS localCode, plm.local_name AS localName,
            plm.product_master_id AS productMasterId, pm.name AS productName,
            pm.category, pm.barcode,
            plm.confidence, plm.status, plm.updated_at AS updatedAt
       FROM product_local_mapping plm
       LEFT JOIN product_master pm ON pm.id = plm.product_master_id
       ${where}
      ORDER BY (plm.status='pending') DESC, plm.updated_at DESC
      LIMIT 500`,
    args,
  );
  res.json({ storeId, mappings: rows });
});

const PatchSchema = z.object({
  action: z.enum(['confirm', 'reject', 'reassign']),
  productMasterId: z.number().int().optional(),
});

router.patch('/:id', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const pool = getPool();

  if (parsed.data.action === 'confirm') {
    await pool.query(
      `UPDATE product_local_mapping SET status='confirmed', confidence = GREATEST(confidence, 1.00)
        WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
  } else if (parsed.data.action === 'reject') {
    await pool.query(
      `UPDATE product_local_mapping SET status='rejected' WHERE id = ? AND store_id = ?`,
      [id, storeId],
    );
  } else if (parsed.data.action === 'reassign') {
    if (!parsed.data.productMasterId) {
      res.status(400).json({ error: 'product_master_id_required' });
      return;
    }
    await pool.query(
      `UPDATE product_local_mapping
          SET product_master_id = ?, status='confirmed', confidence=1.00
        WHERE id = ? AND store_id = ?`,
      [parsed.data.productMasterId, id, storeId],
    );
  }

  await audit({
    storeId,
    eventType: `mapping.${parsed.data.action}`,
    message: `mapping #${id}`,
    metadata: { id, ...parsed.data },
  });
  res.json({ ok: true, id });
});

router.post('/auto-rerun', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const pool = getPool();
  const [pending] = await pool.query<any[]>(
    `SELECT local_code AS localCode, local_name AS localName
       FROM product_local_mapping
      WHERE store_id = ? AND status = 'pending'`,
    [storeId],
  );
  let resolved = 0;
  for (const m of pending) {
    const r = await upsertMapping({ storeId, localCode: m.localCode, localName: m.localName });
    if (r.status !== 'pending') resolved++;
  }
  res.json({ storeId, attempted: pending.length, resolved });
});

export default router;
