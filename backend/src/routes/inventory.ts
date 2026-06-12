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
  // 동일 상품이 여러 입고 배치(expires_at 상이)로 분리 저장되므로 상품 단위로 합산하여 1행으로 표시.
  // 수량은 합계, 유통기한은 가장 임박한(가장 이른) 배치 기준으로 노출한다.
  const [rows] = await pool.query<any[]>(
    `SELECT MIN(i.id) AS id, i.product_master_id AS productMasterId, pm.name AS productName,
            pm.category, pm.temp_zone AS tempZone, pm.shelf_life_days AS shelfLifeDays,
            CAST(SUM(i.quantity) AS SIGNED) AS quantity,
            MIN(i.shelf_location) AS shelfLocation,
            MIN(i.expires_at) AS expiresAt,
            DATEDIFF(MIN(i.expires_at), CURRENT_DATE) AS daysToExpiry,
            MAX(i.updated_at) AS updatedAt
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
      WHERE ${wheres.join(' AND ')}
      GROUP BY i.product_master_id, pm.name, pm.category, pm.temp_zone, pm.shelf_life_days
      ORDER BY (MIN(i.expires_at) IS NULL), MIN(i.expires_at) ASC, pm.name ASC
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
