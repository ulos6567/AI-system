/**
 * 002 (T009) — 운영 신호 탐지 서비스 (FR-001)
 *
 *   탐지 신호(1차):
 *     - waste_risk : 유통기한 임박(≤ threshold_days) + 재고 > 0  → 상품 단위
 *     - sales_drop : 최근 N일 매출이 직전 N일 대비 임계% 이상 감소 → 점포 단위
 *     - overstock  : 재고가 최근 일평균 판매량 대비 과다 → 상품 단위
 *
 *   결과는 operational_signal 행으로 적재된다(중복 방지: 같은 날 같은 유형/상품은 1건).
 */
import { getPool } from '../db/pool';

export interface DetectedSignal {
  storeId: number;
  signalType: 'sales_drop' | 'waste_risk' | 'demand_surge' | 'overstock' | 'weather_impact';
  severity: number;
  productId: number | null;
  detectedAt: Date;
  payload: Record<string, unknown>;
}

const WASTE_THRESHOLD_DAYS = 1;
const SALES_DROP_WINDOW_DAYS = 7;
const SALES_DROP_MIN_PCT = 25;
const OVERSTOCK_DAYS_OF_SUPPLY = 14;

async function detectWasteRisk(storeId: number): Promise<DetectedSignal[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT i.product_master_id AS productId, pm.name AS productName,
            i.quantity AS quantity,
            DATEDIFF(i.expires_at, CURRENT_DATE) AS daysToExpiry
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
      WHERE i.store_id = ?
        AND i.expires_at IS NOT NULL
        AND i.expires_at <= DATE_ADD(CURRENT_DATE, INTERVAL ? DAY)
        AND i.quantity > 0`,
    [storeId, WASTE_THRESHOLD_DAYS],
  );
  return rows.map((r) => ({
    storeId,
    signalType: 'waste_risk' as const,
    severity: r.daysToExpiry <= 0 ? 5 : 4,
    productId: Number(r.productId),
    detectedAt: new Date(),
    payload: {
      productName: r.productName,
      quantity: Number(r.quantity),
      daysToExpiry: Number(r.daysToExpiry),
      thresholdDays: WASTE_THRESHOLD_DAYS,
    },
  }));
}

async function detectSalesDrop(storeId: number): Promise<DetectedSignal[]> {
  const pool = getPool();
  const w = SALES_DROP_WINDOW_DAYS;
  const [rows] = await pool.query<any[]>(
    `SELECT
        SUM(CASE WHEN t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN t.total_amount ELSE 0 END) AS recent,
        SUM(CASE WHEN t.occurred_at <  DATE_SUB(NOW(), INTERVAL ? DAY)
                  AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN t.total_amount ELSE 0 END) AS prior
       FROM \`transaction\` t
      WHERE t.store_id = ? AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [w, w, w * 2, storeId, w * 2],
  );
  const recent = Number(rows[0]?.recent ?? 0);
  const prior = Number(rows[0]?.prior ?? 0);
  if (prior <= 0) return [];
  const dropPct = ((prior - recent) / prior) * 100;
  if (dropPct < SALES_DROP_MIN_PCT) return [];
  return [
    {
      storeId,
      signalType: 'sales_drop',
      severity: dropPct >= 50 ? 5 : 3,
      productId: null,
      detectedAt: new Date(),
      payload: {
        recent,
        prior,
        dropPct: Math.round(dropPct * 10) / 10,
        windowDays: w,
      },
    },
  ];
}

async function detectOverstock(storeId: number): Promise<DetectedSignal[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT i.product_master_id AS productId, pm.name AS productName, i.quantity AS quantity,
            COALESCE(s.daily_units, 0) AS dailyUnits
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
       LEFT JOIN (
         SELECT ti.product_master_id, SUM(ti.quantity) / ? AS daily_units
           FROM transaction_item ti
           JOIN \`transaction\` t ON t.id = ti.transaction_id
          WHERE t.store_id = ? AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          GROUP BY ti.product_master_id
       ) s ON s.product_master_id = i.product_master_id
      WHERE i.store_id = ? AND i.quantity > 0`,
    [SALES_DROP_WINDOW_DAYS, storeId, SALES_DROP_WINDOW_DAYS, storeId],
  );
  const out: DetectedSignal[] = [];
  for (const r of rows) {
    const daily = Number(r.dailyUnits);
    const qty = Number(r.quantity);
    if (daily <= 0) continue;
    const daysOfSupply = qty / daily;
    if (daysOfSupply < OVERSTOCK_DAYS_OF_SUPPLY) continue;
    out.push({
      storeId,
      signalType: 'overstock',
      severity: 2,
      productId: Number(r.productId),
      detectedAt: new Date(),
      payload: {
        productName: r.productName,
        quantity: qty,
        dailyUnits: Math.round(daily * 10) / 10,
        daysOfSupply: Math.round(daysOfSupply),
      },
    });
  }
  return out;
}

/** 한 점포의 신호를 탐지하여 반환(적재는 호출 측/prescription 서비스가 담당). */
export async function detectSignals(storeId: number): Promise<DetectedSignal[]> {
  const [waste, drop, over] = await Promise.all([
    detectWasteRisk(storeId),
    detectSalesDrop(storeId),
    detectOverstock(storeId),
  ]);
  return [...waste, ...drop, ...over];
}
