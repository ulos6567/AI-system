/**
 * T026 — POST /api/stores/{storeId}/transactions/ingest
 *   요청 본문: { transactions: PosTransaction[] }  또는  CSV (text/csv)
 *   응답: { accepted, rejected }
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPosAdapter } from '../adapters/factory';
import { getPool } from '../db/pool';
import type { PosTransaction } from '../ports/pos';
import { logger } from '../lib/logger';

const router = Router({ mergeParams: true });

const TxItemSchema = z.object({
  localCode: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const TxSchema = z.object({
  externalId: z.string().min(1),
  occurredAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  posSource: z.enum(['pos', 'self_kiosk', 'app']).default('pos'),
  totalAmount: z.number().nonnegative(),
  paymentMethod: z.string().optional(),
  items: z.array(TxItemSchema).min(1),
});

const IngestSchema = z.object({
  transactions: z.array(TxSchema).min(1).max(500),
});

function parseCsv(csv: string): PosTransaction[] {
  // 헤더: external_id,occurred_at,total,payment,pos_source,local_code,qty,unit_price
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const grouped = new Map<string, PosTransaction>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 8) continue;
    const [externalId, occurredAt, totalAmount, paymentMethod, posSource, localCode, qty, unitPrice] = cols;
    if (!grouped.has(externalId)) {
      grouped.set(externalId, {
        externalId,
        occurredAt: new Date(occurredAt),
        totalAmount: Number(totalAmount),
        paymentMethod,
        posSource: (posSource as any) || 'pos',
        items: [],
      });
    }
    grouped.get(externalId)!.items.push({
      localCode,
      quantity: Number(qty),
      unitPrice: Number(unitPrice),
    });
  }
  return Array.from(grouped.values());
}

/**
 * T044 — GET /api/stores/:storeId/transactions
 *        ?from=YYYY-MM-DD &to=YYYY-MM-DD &posSource=pos|self_kiosk|app
 *        ?aggregate=daily|weekly|monthly  → 집계 응답
 *        기본: 최근 50건 raw 목록
 */
router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const posSource = (req.query.posSource as string | undefined) ?? null;
  const aggregate = (req.query.aggregate as string | undefined) ?? null;

  const wheres: string[] = ['t.store_id = ?'];
  const args: any[] = [storeId];
  if (from) { wheres.push('t.occurred_at >= ?'); args.push(from); }
  if (to)   { wheres.push('t.occurred_at <  ?'); args.push(to); }
  if (posSource) { wheres.push('t.pos_source = ?'); args.push(posSource); }
  const whereSql = `WHERE ${wheres.join(' AND ')}`;

  const pool = getPool();

  if (aggregate === 'daily' || aggregate === 'weekly' || aggregate === 'monthly') {
    const bucket =
      aggregate === 'daily'
        ? `DATE(t.occurred_at)`
        : aggregate === 'weekly'
          ? `DATE_FORMAT(t.occurred_at, '%x-W%v')`
          : `DATE_FORMAT(t.occurred_at, '%Y-%m')`;
    const [rows] = await pool.query<any[]>(
      `SELECT ${bucket} AS bucket,
              COUNT(*) AS txCount,
              COALESCE(SUM(t.total_amount), 0) AS revenue,
              COALESCE(AVG(t.total_amount), 0) AS avgTicket
         FROM \`transaction\` t
         ${whereSql}
        GROUP BY bucket
        ORDER BY bucket ASC`,
      args,
    );
    res.json({ storeId, aggregate, series: rows });
    return;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT t.id, t.pos_source AS posSource, t.occurred_at AS occurredAt,
            t.total_amount AS totalAmount, t.payment_method AS paymentMethod,
            (SELECT COUNT(*) FROM transaction_item ti WHERE ti.transaction_id = t.id) AS itemCount
       FROM \`transaction\` t
       ${whereSql}
      ORDER BY t.occurred_at DESC
      LIMIT 200`,
    args,
  );
  res.json({ storeId, transactions: rows });
});

router.post('/ingest', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const pos = getPosAdapter();
  let txs: PosTransaction[] = [];

  try {
    if (req.is('text/csv')) {
      const csv = typeof req.body === 'string' ? req.body : String(req.body);
      txs = parseCsv(csv);
    } else {
      const parsed = IngestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
        return;
      }
      txs = parsed.data.transactions.map((t) => ({
        externalId: t.externalId,
        occurredAt: new Date(t.occurredAt),
        totalAmount: t.totalAmount,
        paymentMethod: t.paymentMethod,
        posSource: t.posSource,
        items: t.items,
      }));
    }
    if (txs.length === 0) {
      res.status(400).json({ error: 'no_transactions_parsed' });
      return;
    }
    const result = await pos.ingestBatch(storeId, txs);
    res.json(result);
  } catch (err: any) {
    logger.error({ err: err.message, storeId }, 'ingest failed');
    res.status(500).json({ error: 'ingest_failed', detail: err.message });
  }
});

export default router;
