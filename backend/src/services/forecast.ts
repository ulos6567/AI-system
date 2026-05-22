/**
 * T029 — 수요 예측 서비스 (FR-005, R-001)
 *   - 점포×상품×목표일에 대해 다음 산식으로 baseline 예측:
 *     base = avg(최근 N일 동일 요일 판매량)
 *     weather_factor = (rain → -10% ~ -20%, hot summer → +5% 음료/아이스 카테고리)
 *     event_factor = (target_date 에 event 신호 있으면 +20%)
 *   - 결과는 demand_forecast 테이블에 upsert.
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';

const LOOKBACK_DAYS = 28;
const MODEL_VERSION = 'baseline-v1';

async function avgSalesSameDow(
  storeId: number,
  productMasterId: number,
  targetDate: Date,
): Promise<{ avgQty: number; sampleDays: number }> {
  const pool = getPool();
  const dow = targetDate.getDay(); // 0=일
  const [rows] = await pool.query<any[]>(
    `SELECT
        DATE(t.occurred_at) AS day,
        SUM(ti.quantity) AS qty
       FROM \`transaction\` t
       JOIN transaction_item ti ON ti.transaction_id = t.id
      WHERE t.store_id = ?
        AND ti.product_master_id = ?
        AND t.occurred_at >= DATE_SUB(?, INTERVAL ? DAY)
        AND t.occurred_at <  ?
        AND DAYOFWEEK(t.occurred_at) = ?
      GROUP BY DATE(t.occurred_at)`,
    [storeId, productMasterId, targetDate, LOOKBACK_DAYS, targetDate, dow + 1],
  );
  if (rows.length === 0) return { avgQty: 0, sampleDays: 0 };
  const total = rows.reduce((s, r) => s + Number(r.qty), 0);
  return { avgQty: total / rows.length, sampleDays: rows.length };
}

async function weatherFactorFor(storeId: number, targetDate: Date): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT payload_json FROM external_signal
      WHERE signal_type = 'weather'
        AND (store_id = ? OR store_id IS NULL)
        AND occurred_at >= DATE_SUB(?, INTERVAL 1 DAY)
      ORDER BY occurred_at DESC LIMIT 1`,
    [storeId, targetDate],
  );
  if (rows.length === 0) return 1.0;
  const payload = typeof rows[0].payload_json === 'string'
    ? JSON.parse(rows[0].payload_json)
    : rows[0].payload_json;
  const rain = Number(payload?.rain_mm ?? 0);
  if (rain > 5) return 0.8;
  if (rain > 0) return 0.92;
  return 1.0;
}

async function eventFactor(storeId: number, targetDate: Date): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT 1 FROM external_signal
      WHERE signal_type = 'event'
        AND (store_id = ? OR store_id IS NULL)
        AND DATE(occurred_at) = DATE(?)
      LIMIT 1`,
    [storeId, targetDate],
  );
  return rows.length > 0 ? 1.2 : 1.0;
}

export interface ForecastOutput {
  storeId: number;
  productMasterId: number;
  targetDate: string; // YYYY-MM-DD
  predictedQuantity: number;
  confidence: number;
  modelVersion: string;
}

export async function forecastOne(opts: {
  storeId: number;
  productMasterId: number;
  targetDate: Date;
}): Promise<ForecastOutput> {
  const { avgQty, sampleDays } = await avgSalesSameDow(opts.storeId, opts.productMasterId, opts.targetDate);
  const wf = await weatherFactorFor(opts.storeId, opts.targetDate);
  const ef = await eventFactor(opts.storeId, opts.targetDate);
  const predicted = Math.max(0, Math.round(avgQty * wf * ef));
  const confidence = sampleDays >= 3 ? 0.7 + Math.min(0.25, sampleDays * 0.03) : 0.4 + sampleDays * 0.1;

  const pool = getPool();
  await pool.query(
    `INSERT INTO demand_forecast
       (store_id, product_master_id, target_date, predicted_quantity, confidence, model_version, generated_at)
     VALUES (?, ?, DATE(?), ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       predicted_quantity = VALUES(predicted_quantity),
       confidence = VALUES(confidence),
       model_version = VALUES(model_version),
       generated_at = VALUES(generated_at)`,
    [opts.storeId, opts.productMasterId, opts.targetDate, predicted, Math.round(confidence * 100) / 100, MODEL_VERSION],
  );
  return {
    storeId: opts.storeId,
    productMasterId: opts.productMasterId,
    targetDate: opts.targetDate.toISOString().slice(0, 10),
    predictedQuantity: predicted,
    confidence: Math.round(confidence * 100) / 100,
    modelVersion: MODEL_VERSION,
  };
}

export async function forecastStoreFor(storeId: number, targetDate: Date): Promise<ForecastOutput[]> {
  const pool = getPool();
  const [products] = await pool.query<any[]>(
    `SELECT DISTINCT product_master_id AS id
       FROM product_local_mapping
      WHERE store_id = ? AND status IN ('auto','confirmed') AND product_master_id IS NOT NULL`,
    [storeId],
  );
  const results: ForecastOutput[] = [];
  for (const p of products) {
    results.push(await forecastOne({ storeId, productMasterId: p.id, targetDate }));
  }
  await audit({
    storeId,
    eventType: 'forecast.generated',
    message: `${results.length} products for ${targetDate.toISOString().slice(0, 10)}`,
    metadata: { count: results.length, targetDate: targetDate.toISOString().slice(0, 10), modelVersion: MODEL_VERSION },
  });
  logger.info({ storeId, count: results.length, targetDate }, 'forecast generated');
  return results;
}

export async function listLatestForecasts(storeId: number, targetDate: Date): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT df.product_master_id AS productMasterId,
            pm.name              AS productName,
            pm.category          AS category,
            df.target_date       AS targetDate,
            df.predicted_quantity AS predictedQuantity,
            df.confidence        AS confidence,
            df.model_version     AS modelVersion,
            df.generated_at      AS generatedAt
       FROM demand_forecast df
       JOIN product_master pm ON pm.id = df.product_master_id
      WHERE df.store_id = ? AND df.target_date = DATE(?)
      ORDER BY df.predicted_quantity DESC`,
    [storeId, targetDate],
  );
  return rows;
}
