/**
 * T032 — 물류 모의 어댑터 (CSV 응답)
 *   - 메모리 큐에 발주를 적재하고 CSV 줄을 생성한다.
 *   - 실제 송신은 후속 단계에서 EDI/REST 어댑터로 교체.
 */
import type { LogisticsAdapter, LogisticsOrderRequest } from '../../ports/logistics';
import { logger } from '../../lib/logger';

interface SentRecord {
  ref: string;
  storeId: number;
  purchaseOrderId: number;
  csv: string;
  sentAt: Date;
}

const SENT: SentRecord[] = [];

function toCsv(req: LogisticsOrderRequest, ref: string): string {
  const header = 'ref,store_id,product_master_id,quantity,desired_delivery';
  const rows = req.items.map(
    (i) =>
      `${ref},${req.storeId},${i.productMasterId},${i.quantity},${req.desiredDeliveryDate.toISOString().slice(0, 10)}`,
  );
  return [header, ...rows].join('\n');
}

const adapter: LogisticsAdapter = {
  name: 'logistics-mock',
  async send(req) {
    const externalRef = `LMOCK-${req.storeId}-${Date.now()}`;
    const csv = toCsv(req, externalRef);
    SENT.push({
      ref: externalRef,
      storeId: req.storeId,
      purchaseOrderId: req.purchaseOrderId,
      csv,
      sentAt: new Date(),
    });
    logger.info(
      { ref: externalRef, items: req.items.length, store: req.storeId, po: req.purchaseOrderId },
      'logistics-mock send (csv generated)',
    );
    return {
      externalRef,
      accepted: true,
      estimatedDelivery: req.desiredDeliveryDate,
      rawResponse: { csv },
    };
  },
};

export function getRecentLogisticsSends(limit = 50): SentRecord[] {
  return SENT.slice(-limit).reverse();
}

export default adapter;
