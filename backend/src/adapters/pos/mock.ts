/**
 * T025 — POS 모의 어댑터
 *   - ingestBatch: CSV 업로드 또는 외부 호출 본문 → transaction/transaction_item 적재
 *   - startStream: 점포별 가상 거래를 일정 주기로 생성해 onTx 콜백 발사 (시연용)
 *
 *  local_code 는 product_local_mapping 에서 product_master_id 로 해석한다.
 *  매핑 status='pending'/'rejected' 인 코드는 rejected 로 계수.
 */
import type { PosAdapter, PosTransaction } from '../../ports/pos';
import { getPool } from '../../db/pool';
import { logger } from '../../lib/logger';
import { audit } from '../../lib/audit';

const STREAMS = new Map<number, NodeJS.Timeout>();

async function resolveLocalCodes(storeId: number, codes: string[]): Promise<Map<string, number | null>> {
  if (codes.length === 0) return new Map();
  const pool = getPool();
  const placeholders = codes.map(() => '?').join(',');
  const [rows] = await pool.query<any[]>(
    `SELECT local_code, product_master_id, status
       FROM product_local_mapping
      WHERE store_id = ? AND local_code IN (${placeholders})`,
    [storeId, ...codes],
  );
  const m = new Map<string, number | null>();
  for (const r of rows) {
    const usable = r.status === 'auto' || r.status === 'confirmed';
    m.set(r.local_code, usable ? (r.product_master_id as number) : null);
  }
  return m;
}

async function applyInventoryDelta(
  conn: any,
  storeId: number,
  productMasterId: number,
  quantity: number,
  occurredAt: Date,
): Promise<void> {
  await conn.query(
    `INSERT INTO inventory (store_id, product_master_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = GREATEST(quantity - ?, 0)`,
    [storeId, productMasterId, 0, quantity],
  );
  await conn.query(
    `INSERT INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at)
       VALUES (?, ?, ?, 'sale', ?)`,
    [storeId, productMasterId, -quantity, occurredAt],
  );
}

const adapter: PosAdapter = {
  name: 'pos-mock',

  async ingestBatch(storeId, txs) {
    const pool = getPool();
    let accepted = 0;
    let rejected = 0;

    const allCodes = Array.from(new Set(txs.flatMap((t) => t.items.map((i) => i.localCode))));
    const codeMap = await resolveLocalCodes(storeId, allCodes);

    for (const tx of txs) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const resolvedItems = tx.items.map((it) => ({
          ...it,
          productMasterId: codeMap.get(it.localCode) ?? null,
        }));
        const hasUnresolved = resolvedItems.some((it) => it.productMasterId === null);
        if (hasUnresolved) {
          await conn.rollback();
          rejected++;
          await audit({
            storeId,
            severity: 'warn',
            eventType: 'pos.ingest.rejected',
            message: `unresolved local codes for tx ${tx.externalId}`,
            metadata: { externalId: tx.externalId, codes: resolvedItems.filter((i) => !i.productMasterId).map((i) => i.localCode) },
          });
          continue;
        }

        const [txResult]: any = await conn.query(
          `INSERT INTO \`transaction\` (store_id, pos_source, occurred_at, total_amount, payment_method)
             VALUES (?, ?, ?, ?, ?)`,
          [storeId, tx.posSource, tx.occurredAt, tx.totalAmount, tx.paymentMethod ?? null],
        );
        const txId = txResult.insertId as number;

        for (const it of resolvedItems) {
          await conn.query(
            `INSERT INTO transaction_item (transaction_id, product_master_id, quantity, unit_price)
               VALUES (?, ?, ?, ?)`,
            [txId, it.productMasterId, it.quantity, it.unitPrice],
          );
          await applyInventoryDelta(conn, storeId, it.productMasterId!, it.quantity, tx.occurredAt);
        }

        await conn.commit();
        accepted++;
      } catch (err: any) {
        await conn.rollback();
        rejected++;
        logger.error({ err: err.message, tx: tx.externalId }, 'pos-mock ingest failed');
      } finally {
        conn.release();
      }
    }

    await audit({
      storeId,
      eventType: 'pos.ingest.batch',
      message: `accepted=${accepted} rejected=${rejected}`,
      metadata: { accepted, rejected, total: txs.length },
    });
    return { accepted, rejected };
  },

  async startStream(storeId, onTx) {
    if (STREAMS.has(storeId)) {
      logger.warn({ storeId }, 'pos-mock stream already running');
      return;
    }
    const handle = setInterval(async () => {
      const tx: PosTransaction = {
        externalId: `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        occurredAt: new Date(),
        posSource: 'pos',
        totalAmount: Math.round((1000 + Math.random() * 8000) * 100) / 100,
        paymentMethod: ['card', 'mobile', 'cash'][Math.floor(Math.random() * 3)],
        items: [
          {
            localCode: `S${storeId}-${String(1 + Math.floor(Math.random() * 10)).padStart(3, '0')}`,
            quantity: 1 + Math.floor(Math.random() * 3),
            unitPrice: 1500 + Math.floor(Math.random() * 4500),
          },
        ],
      };
      try {
        await onTx(tx);
      } catch (err: any) {
        logger.error({ err: err.message }, 'pos-mock stream callback failed');
      }
    }, 10_000);
    STREAMS.set(storeId, handle);
    logger.info({ storeId }, 'pos-mock stream started');
  },
};

export default adapter;
