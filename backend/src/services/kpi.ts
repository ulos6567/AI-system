/**
 * T059 — KPI 집계 서비스 (FR-022)
 *
 *   점포×일자 기준 집계 → performance_kpi_daily upsert
 *     - revenue            : SUM(transaction.total_amount)
 *     - transactions_count : COUNT(transaction)
 *     - avg_ticket         : revenue / count
 *     - discard_amount     : SUM(inventory_history.delta * unit_price) where reason='discard'
 *     - discard_rate       : discard_amount / (revenue + discard_amount)
 *     - forecast_mape      : avg(|forecast - actual| / actual) — 0% 분모는 제외
 *
 *   labor_cost 는 1차 범위 외(데이터 소스 미정) — NULL 유지.
 */
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';
import { audit } from '../lib/audit';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface AggregatedRow {
  storeId: number;
  metricDate: string;
  revenue: number;
  transactionsCount: number;
  avgTicket: number;
  discardAmount: number;
  discardRate: number;
  forecastMape: number | null;
}

async function avgUnitPriceFor(storeId: number, productMasterId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT COALESCE(AVG(ti.unit_price), 0) AS avg_p
       FROM transaction_item ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
      WHERE t.store_id = ? AND ti.product_master_id = ?
        AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [storeId, productMasterId],
  );
  return Number(rows[0]?.avg_p ?? 0);
}

async function aggregateForDay(storeId: number, day: Date): Promise<AggregatedRow> {
  const pool = getPool();
  const dayKey = ymd(day);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const nextKey = ymd(next);

  // 매출/거래수
  const [txRows] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(total_amount), 0) AS revenue,
            COUNT(*) AS cnt
       FROM \`transaction\`
      WHERE store_id = ? AND occurred_at >= ? AND occurred_at < ?`,
    [storeId, dayKey, nextKey],
  );
  const revenue = Number(txRows[0]?.revenue ?? 0);
  const cnt = Number(txRows[0]?.cnt ?? 0);
  const avgTicket = cnt > 0 ? revenue / cnt : 0;

  // 폐기 — inventory_history reason='discard', |delta| × 평균 단가
  const [discardRows] = await pool.query<any[]>(
    `SELECT product_master_id AS productMasterId, SUM(-delta) AS units
       FROM inventory_history
      WHERE store_id = ? AND reason = 'discard'
        AND occurred_at >= ? AND occurred_at < ?
      GROUP BY product_master_id`,
    [storeId, dayKey, nextKey],
  );
  let discardAmount = 0;
  for (const row of discardRows) {
    const units = Number(row.units);
    if (units <= 0) continue;
    const price = await avgUnitPriceFor(storeId, Number(row.productMasterId));
    discardAmount += units * price;
  }
  const discardRate = revenue + discardAmount > 0
    ? Math.round((discardAmount / (revenue + discardAmount)) * 10000) / 10000
    : 0;

  // MAPE — 같은 일자에 대해 예측한 demand_forecast 와 실제 판매 수량 비교
  const [mapeRows] = await pool.query<any[]>(
    `SELECT df.product_master_id AS productMasterId,
            df.predicted_quantity AS predicted,
            COALESCE((SELECT SUM(ti.quantity)
                        FROM transaction_item ti
                        JOIN \`transaction\` t ON t.id = ti.transaction_id
                       WHERE t.store_id = df.store_id
                         AND ti.product_master_id = df.product_master_id
                         AND t.occurred_at >= ? AND t.occurred_at < ?), 0) AS actual
       FROM demand_forecast df
      WHERE df.store_id = ? AND df.target_date = ?`,
    [dayKey, nextKey, storeId, dayKey],
  );
  let mapeSum = 0;
  let mapeN = 0;
  for (const r of mapeRows) {
    const actual = Number(r.actual);
    if (actual <= 0) continue; // 0 분모 제외
    const predicted = Number(r.predicted);
    mapeSum += Math.abs(predicted - actual) / actual;
    mapeN += 1;
  }
  const forecastMape = mapeN > 0 ? Math.round((mapeSum / mapeN) * 10000) / 10000 : null;

  // upsert
  await pool.query(
    `INSERT INTO performance_kpi_daily
       (store_id, metric_date, revenue, transactions_count, avg_ticket, discard_amount, discard_rate, forecast_mape)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       revenue = VALUES(revenue),
       transactions_count = VALUES(transactions_count),
       avg_ticket = VALUES(avg_ticket),
       discard_amount = VALUES(discard_amount),
       discard_rate = VALUES(discard_rate),
       forecast_mape = VALUES(forecast_mape)`,
    [storeId, dayKey, revenue, cnt, Math.round(avgTicket * 100) / 100, Math.round(discardAmount * 100) / 100, discardRate, forecastMape],
  );

  return {
    storeId,
    metricDate: dayKey,
    revenue,
    transactionsCount: cnt,
    avgTicket: Math.round(avgTicket * 100) / 100,
    discardAmount: Math.round(discardAmount * 100) / 100,
    discardRate,
    forecastMape,
  };
}

export async function aggregateAllStoresFor(day: Date): Promise<AggregatedRow[]> {
  const pool = getPool();
  const [stores] = await pool.query<any[]>(`SELECT id FROM store WHERE status = 'active'`);
  const out: AggregatedRow[] = [];
  for (const s of stores) {
    try {
      out.push(await aggregateForDay(Number(s.id), day));
    } catch (err: any) {
      logger.error({ err: err.message, storeId: s.id, day: ymd(day) }, 'kpi aggregate failed');
    }
  }
  if (out.length > 0) {
    await audit({
      eventType: 'kpi.aggregated',
      message: `day=${ymd(day)} stores=${out.length}`,
      metadata: { day: ymd(day), stores: out.length },
    });
  }
  return out;
}

export async function backfillRange(storeId: number, from: Date, to: Date): Promise<AggregatedRow[]> {
  const results: AggregatedRow[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  while (cur <= to) {
    results.push(await aggregateForDay(storeId, new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }
  return results;
}

export async function listDailyReports(
  storeId: number,
  from: Date,
  to: Date,
): Promise<AggregatedRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT store_id AS storeId, metric_date AS metricDate, revenue,
            transactions_count AS transactionsCount, avg_ticket AS avgTicket,
            discard_amount AS discardAmount, discard_rate AS discardRate,
            labor_cost AS laborCost, forecast_mape AS forecastMape
       FROM performance_kpi_daily
      WHERE store_id = ? AND metric_date >= ? AND metric_date <= ?
      ORDER BY metric_date ASC`,
    [storeId, ymd(from), ymd(to)],
  );
  return rows;
}
