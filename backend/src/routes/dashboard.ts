/**
 * 002 (T022 동반) — 데이터 대시보드 집계
 *   GET /api/stores/:storeId/dashboard?from=&to=&category=
 *     - KPI 요약(매출·거래·객단가·폐기율·예측정확도)
 *     - 일별 매출 시계열(차트)
 *     - 카테고리별 매출/판매량(차트·필터)
 *     - 상위 상품(대표 이미지 동반, 이미지 100% 보장)
 *
 *   3초 내 표출·빈 화면 0건을 위해 단일 호출로 대시보드 데이터를 제공한다(SC-008).
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPool } from '../db/pool';
import { resolveImage } from '../services/product-media';

const router = Router({ mergeParams: true });

function parseDate(s: unknown, fallback: Date): Date {
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(`${s.slice(0, 10)}T00:00:00`);
  return fallback;
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const to = parseDate(req.query.to, new Date());
  const defaultFrom = new Date(to);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const from = parseDate(req.query.from, defaultFrom);
  const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : null;
  const pool = getPool();

  const catFilter = category ? 'AND pm.category = ?' : '';
  const fromStr = `${ymd(from)} 00:00:00`;
  const toStr = `${ymd(to)} 23:59:59`;

  // KPI 요약 + 일별 매출 (카테고리 필터 시 품목 기준 집계, 미필터 시 거래 총액)
  const [kpiRows] = category
    ? await pool.query<any[]>(
        `SELECT COALESCE(SUM(ti.quantity * ti.unit_price), 0) AS revenue,
                COUNT(DISTINCT t.id) AS txCount,
                COALESCE(SUM(ti.quantity), 0) AS units
           FROM \`transaction\` t
           JOIN transaction_item ti ON ti.transaction_id = t.id
           JOIN product_master pm ON pm.id = ti.product_master_id
          WHERE t.store_id = ? AND t.occurred_at BETWEEN ? AND ? ${catFilter}`,
        [storeId, fromStr, toStr, category],
      )
    : await pool.query<any[]>(
        `SELECT COALESCE(SUM(t.total_amount), 0) AS revenue,
                COUNT(*) AS txCount, 0 AS units
           FROM \`transaction\` t
          WHERE t.store_id = ? AND t.occurred_at BETWEEN ? AND ?`,
        [storeId, fromStr, toStr],
      );
  const revenue = Number(kpiRows[0]?.revenue ?? 0);
  const txCount = Number(kpiRows[0]?.txCount ?? 0);
  const avgTicket = txCount > 0 ? revenue / txCount : 0;

  // 일별 매출 시계열
  const [series] = category
    ? await pool.query<any[]>(
        `SELECT DATE(t.occurred_at) AS d, SUM(ti.quantity * ti.unit_price) AS revenue, SUM(ti.quantity) AS units
           FROM \`transaction\` t
           JOIN transaction_item ti ON ti.transaction_id = t.id
           JOIN product_master pm ON pm.id = ti.product_master_id
          WHERE t.store_id = ? AND t.occurred_at BETWEEN ? AND ? ${catFilter}
          GROUP BY DATE(t.occurred_at) ORDER BY d`,
        [storeId, fromStr, toStr, category],
      )
    : await pool.query<any[]>(
        `SELECT DATE(t.occurred_at) AS d, SUM(t.total_amount) AS revenue, COUNT(*) AS units
           FROM \`transaction\` t
          WHERE t.store_id = ? AND t.occurred_at BETWEEN ? AND ?
          GROUP BY DATE(t.occurred_at) ORDER BY d`,
        [storeId, fromStr, toStr],
      );

  // 카테고리별 매출/판매량
  const [categories] = await pool.query<any[]>(
    `SELECT pm.category AS category,
            SUM(ti.quantity * ti.unit_price) AS revenue,
            SUM(ti.quantity) AS units
       FROM \`transaction\` t
       JOIN transaction_item ti ON ti.transaction_id = t.id
       JOIN product_master pm ON pm.id = ti.product_master_id
      WHERE t.store_id = ? AND t.occurred_at BETWEEN ? AND ?
      GROUP BY pm.category ORDER BY revenue DESC`,
    [storeId, fromStr, toStr],
  );

  // 상위 상품 (대표 이미지 동반)
  const [topRows] = await pool.query<any[]>(
    `SELECT ti.product_master_id AS productId, pm.name, pm.category,
            SUM(ti.quantity) AS units, SUM(ti.quantity * ti.unit_price) AS revenue
       FROM \`transaction\` t
       JOIN transaction_item ti ON ti.transaction_id = t.id
       JOIN product_master pm ON pm.id = ti.product_master_id
      WHERE t.store_id = ? AND t.occurred_at BETWEEN ? AND ? ${catFilter}
      GROUP BY ti.product_master_id, pm.name, pm.category
      ORDER BY units DESC LIMIT 8`,
    category ? [storeId, fromStr, toStr, category] : [storeId, fromStr, toStr],
  );
  const topProducts = await Promise.all(
    topRows.map(async (r) => ({
      productId: Number(r.productId),
      name: r.name,
      category: r.category,
      units: Number(r.units),
      revenue: Number(r.revenue),
      image: await resolveImage(Number(r.productId)),
    })),
  );

  // 폐기율 (inventory_history discard 기반)
  const [discardRows] = await pool.query<any[]>(
    `SELECT COALESCE(-SUM(CASE WHEN ih.reason = 'discard' THEN ih.delta ELSE 0 END), 0) AS discardUnits
       FROM inventory_history ih
      WHERE ih.store_id = ? AND ih.occurred_at BETWEEN ? AND ?`,
    [storeId, fromStr, toStr],
  );

  res.json({
    storeId,
    from: ymd(from),
    to: ymd(to),
    category,
    summary: {
      revenue: Math.round(revenue),
      transactionsCount: txCount,
      avgTicket: Math.round(avgTicket),
      units: Number(kpiRows[0]?.units ?? 0),
      discardUnits: Number(discardRows[0]?.discardUnits ?? 0),
    },
    series: series.map((r) => ({ date: ymd(new Date(r.d)), revenue: Number(r.revenue), units: Number(r.units) })),
    categories: categories.map((r) => ({
      category: r.category ?? 'etc',
      revenue: Number(r.revenue),
      units: Number(r.units),
    })),
    topProducts,
  });
});

export default router;
