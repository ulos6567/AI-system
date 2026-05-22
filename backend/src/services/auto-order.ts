/**
 * T031 — 자동 발주 도메인 서비스 (FR-006, FR-017)
 *
 *   1. 다음 영업일에 대해 forecast 가 없으면 forecastStoreFor() 호출
 *   2. 현재 재고 - 예측 수량 = 발주 필요량 (음수면 0)
 *   3. ordered_quantity 가 product 의 직전 30일 평균 발주량의 N배(기본 3.0)를 초과하면
 *        purchase_order.auto_hold_reason 설정 + status='pending_review'
 *      그 외에는 status='approved' → logistics 어댑터로 송신 → status='sent'
 *   4. 모든 단계는 event_log 에 audit
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';
import { forecastStoreFor, listLatestForecasts } from './forecast';
import { getLogisticsAdapter } from '../adapters/factory';

const ABNORMAL_MULTIPLIER = 3.0;

interface OrderItemDraft {
  productMasterId: number;
  productName: string;
  predictedQuantity: number;
  currentStock: number;
  orderedQuantity: number;
  pastAvgOrdered: number;
}

async function getCurrentStock(storeId: number, productMasterId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory
      WHERE store_id = ? AND product_master_id = ?`,
    [storeId, productMasterId],
  );
  return Number(rows[0]?.qty ?? 0);
}

async function pastAvgOrdered(storeId: number, productMasterId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT COALESCE(AVG(poi.ordered_quantity), 0) AS avg_qty
       FROM purchase_order po
       JOIN purchase_order_item poi ON poi.purchase_order_id = po.id
      WHERE po.store_id = ?
        AND poi.product_master_id = ?
        AND po.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [storeId, productMasterId],
  );
  return Number(rows[0]?.avg_qty ?? 0);
}

function nextBusinessDate(today = new Date()): Date {
  const d = new Date(today);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function ensureForecastsFor(storeId: number, targetDate: Date): Promise<any[]> {
  let forecasts = await listLatestForecasts(storeId, targetDate);
  if (forecasts.length === 0) {
    await forecastStoreFor(storeId, targetDate);
    forecasts = await listLatestForecasts(storeId, targetDate);
  }
  return forecasts;
}

export interface GeneratedOrder {
  purchaseOrderId: number;
  status: string;
  autoHoldReason: string | null;
  items: OrderItemDraft[];
  targetDate: string;
}

export async function generateAutoOrder(opts: {
  storeId: number;
  userId?: number | null;
  targetDate?: Date;
}): Promise<GeneratedOrder> {
  const pool = getPool();
  const targetDate = opts.targetDate ?? nextBusinessDate();
  const forecasts = await ensureForecastsFor(opts.storeId, targetDate);

  const itemDrafts: OrderItemDraft[] = [];
  const reasons: string[] = [];

  for (const f of forecasts) {
    const stock = await getCurrentStock(opts.storeId, f.productMasterId);
    const need = Math.max(0, Number(f.predictedQuantity) - stock);
    if (need === 0) continue;
    const avg = await pastAvgOrdered(opts.storeId, f.productMasterId);
    if (avg > 0 && need > avg * ABNORMAL_MULTIPLIER) {
      reasons.push(`${f.productName}: ordered=${need} > avg×${ABNORMAL_MULTIPLIER} (avg=${avg.toFixed(1)})`);
    }
    itemDrafts.push({
      productMasterId: f.productMasterId,
      productName: f.productName,
      predictedQuantity: Number(f.predictedQuantity),
      currentStock: stock,
      orderedQuantity: need,
      pastAvgOrdered: avg,
    });
  }

  if (itemDrafts.length === 0) {
    logger.info({ storeId: opts.storeId, targetDate }, 'auto-order: nothing to order');
    await audit({
      storeId: opts.storeId,
      userId: opts.userId ?? null,
      eventType: 'order.auto_skip',
      message: 'no items needed',
      metadata: { targetDate: targetDate.toISOString().slice(0, 10) },
    });
    return { purchaseOrderId: -1, status: 'skipped', autoHoldReason: null, items: [], targetDate: targetDate.toISOString().slice(0, 10) };
  }

  const autoHoldReason = reasons.length > 0 ? reasons.join('; ') : null;
  const initialStatus = autoHoldReason ? 'pending_review' : 'approved';

  const conn = await pool.getConnection();
  let purchaseOrderId = -1;
  try {
    await conn.beginTransaction();
    const [orderResult]: any = await conn.query(
      `INSERT INTO purchase_order (store_id, order_date, status, source, auto_hold_reason)
         VALUES (?, DATE(?), ?, 'auto', ?)`,
      [opts.storeId, targetDate, initialStatus, autoHoldReason],
    );
    purchaseOrderId = orderResult.insertId as number;
    for (const it of itemDrafts) {
      await conn.query(
        `INSERT INTO purchase_order_item (purchase_order_id, product_master_id, ordered_quantity)
           VALUES (?, ?, ?)`,
        [purchaseOrderId, it.productMasterId, it.orderedQuantity],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await audit({
    storeId: opts.storeId,
    userId: opts.userId ?? null,
    eventType: autoHoldReason ? 'order.auto_held' : 'order.auto_created',
    severity: autoHoldReason ? 'warn' : 'info',
    message: autoHoldReason ?? `auto-order id=${purchaseOrderId} status=${initialStatus}`,
    metadata: {
      purchaseOrderId,
      itemCount: itemDrafts.length,
      targetDate: targetDate.toISOString().slice(0, 10),
      autoHoldReason,
    },
  });

  if (initialStatus === 'approved') {
    await sendToLogistics(opts.storeId, purchaseOrderId, itemDrafts, targetDate, opts.userId ?? null);
  }

  return {
    purchaseOrderId,
    status: initialStatus,
    autoHoldReason,
    items: itemDrafts,
    targetDate: targetDate.toISOString().slice(0, 10),
  };
}

export async function sendToLogistics(
  storeId: number,
  purchaseOrderId: number,
  items: OrderItemDraft[],
  desiredDeliveryDate: Date,
  userId: number | null,
): Promise<void> {
  const pool = getPool();
  const logistics = getLogisticsAdapter();
  try {
    const result = await logistics.send({
      storeId,
      purchaseOrderId,
      desiredDeliveryDate,
      items: items.map((i) => ({ productMasterId: i.productMasterId, quantity: i.orderedQuantity })),
    });
    await pool.query(
      `UPDATE purchase_order
          SET status = 'sent', sent_at = NOW()
        WHERE id = ?`,
      [purchaseOrderId],
    );
    await audit({
      storeId,
      userId,
      eventType: 'order.auto_sent',
      message: `purchase_order ${purchaseOrderId} sent (ref=${result.externalRef})`,
      metadata: { purchaseOrderId, externalRef: result.externalRef },
    });
  } catch (err: any) {
    await pool.query(`UPDATE purchase_order SET status = 'failed' WHERE id = ?`, [purchaseOrderId]);
    await audit({
      storeId,
      userId,
      severity: 'error',
      eventType: 'order.send_failed',
      message: err.message,
      metadata: { purchaseOrderId },
    });
    throw err;
  }
}

export async function approveAndSend(opts: {
  storeId: number;
  purchaseOrderId: number;
  userId: number;
}): Promise<void> {
  const pool = getPool();
  const [poRows] = await pool.query<any[]>(
    `SELECT id, status, order_date, auto_hold_reason FROM purchase_order
      WHERE id = ? AND store_id = ?`,
    [opts.purchaseOrderId, opts.storeId],
  );
  if (poRows.length === 0) throw new Error('purchase_order not found');
  const po = poRows[0];
  if (po.status !== 'pending_review' && po.status !== 'draft') {
    throw new Error(`cannot approve from status=${po.status}`);
  }

  const [items] = await pool.query<any[]>(
    `SELECT poi.product_master_id AS productMasterId,
            pm.name               AS productName,
            poi.ordered_quantity  AS orderedQuantity
       FROM purchase_order_item poi
       JOIN product_master pm ON pm.id = poi.product_master_id
      WHERE poi.purchase_order_id = ?`,
    [opts.purchaseOrderId],
  );

  await pool.query(
    `UPDATE purchase_order
        SET status = 'approved', approved_by_user_id = ?
      WHERE id = ?`,
    [opts.userId, opts.purchaseOrderId],
  );

  await sendToLogistics(
    opts.storeId,
    opts.purchaseOrderId,
    items.map((i: any) => ({
      productMasterId: i.productMasterId,
      productName: i.productName,
      predictedQuantity: 0,
      currentStock: 0,
      orderedQuantity: i.orderedQuantity,
      pastAvgOrdered: 0,
    })),
    new Date(po.order_date),
    opts.userId,
  );
}
