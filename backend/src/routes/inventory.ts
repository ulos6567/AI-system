/**
 * T043 — GET /api/stores/:storeId/inventory
 *        ?nearExpiry=1            — 유통기한 N일 이내 행만
 *        ?nearExpiryDays=3        — 임계 일수 (기본 3)
 *        ?category=beverage       — 카테고리 필터
 *        ?lowStockThreshold=5     — 재고 ≤ N 행만 추가 필터
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPool } from '../db/pool';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const nearExpiry = req.query.nearExpiry === '1' || req.query.nearExpiry === 'true';
  const nearExpiryDays = Math.max(0, Number(req.query.nearExpiryDays ?? 3));
  const category = (req.query.category as string | undefined) ?? null;
  const lowStockThreshold = req.query.lowStockThreshold !== undefined
    ? Number(req.query.lowStockThreshold)
    : null;

  const args: any[] = [storeId];
  const wheres: string[] = ['i.store_id = ?'];
  if (nearExpiry) {
    wheres.push('i.expires_at IS NOT NULL AND i.expires_at <= DATE_ADD(CURRENT_DATE, INTERVAL ? DAY)');
    args.push(nearExpiryDays);
  }
  if (category) {
    wheres.push('pm.category = ?');
    args.push(category);
  }
  if (lowStockThreshold !== null && Number.isFinite(lowStockThreshold)) {
    wheres.push('i.quantity <= ?');
    args.push(lowStockThreshold);
  }

  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT i.id, i.product_master_id AS productMasterId, pm.name AS productName,
            pm.category, pm.temp_zone AS tempZone, pm.shelf_life_days AS shelfLifeDays,
            i.quantity, i.shelf_location AS shelfLocation, i.expires_at AS expiresAt,
            DATEDIFF(i.expires_at, CURRENT_DATE) AS daysToExpiry,
            i.updated_at AS updatedAt
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
      WHERE ${wheres.join(' AND ')}
      ORDER BY (i.expires_at IS NULL), i.expires_at ASC, pm.name ASC
      LIMIT 500`,
    args,
  );

  const summary = {
    total: rows.length,
    nearExpiry: rows.filter((r) => r.expiresAt && Number(r.daysToExpiry) <= nearExpiryDays).length,
    lowStock: rows.filter((r) => Number(r.quantity) <= 5).length,
    zero: rows.filter((r) => Number(r.quantity) === 0).length,
  };

  res.json({ storeId, summary, items: rows });
});

export default router;
