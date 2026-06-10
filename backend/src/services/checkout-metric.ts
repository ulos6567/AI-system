/**
 * T016a (003) — 셀프 결제 대기시간 계측 서비스 (FR-006, SC-004)
 *   - recordCheckout(): 결제 1건의 시작~완료 대기시간 기록(또는 이탈)
 *   - getCheckoutMetrics(): 기간/채널별 통계 (count, avgMs, p95Ms, withinSlaPct)
 *   - SC-004 목표: 피크타임 wait_ms ≤ 10000. 이탈(abandoned)은 대기 통계에서 제외.
 */
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';

export interface RecordCheckoutInput {
  storeId: number;
  externalId?: string | null;
  channel?: 'self' | 'staff';
  startedAt: Date;
  completedAt?: Date | null;
  outcome?: 'completed' | 'abandoned';
}

export async function recordCheckout(input: RecordCheckoutInput): Promise<{ id: number; waitMs: number | null }> {
  const pool = getPool();
  const channel = input.channel ?? 'self';
  const outcome = input.outcome ?? (input.completedAt ? 'completed' : 'abandoned');
  const waitMs =
    input.completedAt && outcome === 'completed'
      ? Math.max(0, input.completedAt.getTime() - input.startedAt.getTime())
      : null;

  const [result] = await pool.query<any>(
    `INSERT INTO checkout_metric (store_id, external_id, channel, started_at, completed_at, wait_ms, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.storeId, input.externalId ?? null, channel, input.startedAt, input.completedAt ?? null, waitMs, outcome],
  );
  const id = Number(result.insertId);
  logger.debug({ storeId: input.storeId, waitMs, outcome }, 'checkout metric recorded');
  return { id, waitMs };
}

export interface CheckoutMetrics {
  storeId: number;
  channel: string;
  count: number;        // 완료 건수(통계 모수)
  abandoned: number;
  avgMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  withinSlaPct: number | null; // wait_ms ≤ 10000 비율 (SC-004)
  slaMs: number;
}

const SLA_MS = 10_000;

export async function getCheckoutMetrics(opts: {
  storeId: number;
  from?: Date | null;
  to?: Date | null;
  channel?: 'self' | 'staff';
}): Promise<CheckoutMetrics> {
  const pool = getPool();
  const channel = opts.channel ?? 'self';
  const wheres = ["store_id = ?", "outcome = 'completed'", 'wait_ms IS NOT NULL', 'channel = ?'];
  const args: any[] = [opts.storeId, channel];
  if (opts.from) { wheres.push('started_at >= ?'); args.push(opts.from); }
  if (opts.to)   { wheres.push('started_at <  ?'); args.push(opts.to); }
  const where = 'WHERE ' + wheres.join(' AND ');

  // 완료 건의 대기시간 목록(작은 데이터셋 가정 — p95는 앱단 계산)
  const [rows] = await pool.query<any[]>(
    `SELECT wait_ms AS waitMs FROM checkout_metric ${where} ORDER BY wait_ms ASC LIMIT 100000`,
    args,
  );
  const [abandonedRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt FROM checkout_metric
       WHERE store_id = ? AND channel = ? AND outcome = 'abandoned'`,
    [opts.storeId, channel],
  );

  const waits: number[] = rows.map((r) => Number(r.waitMs));
  const count = waits.length;
  const abandoned = Number(abandonedRows[0]?.cnt ?? 0);

  if (count === 0) {
    return { storeId: opts.storeId, channel, count: 0, abandoned, avgMs: null, p95Ms: null, maxMs: null, withinSlaPct: null, slaMs: SLA_MS };
  }

  const sum = waits.reduce((a, b) => a + b, 0);
  const avgMs = Math.round(sum / count);
  const p95Idx = Math.min(count - 1, Math.ceil(count * 0.95) - 1);
  const p95Ms = waits[p95Idx];
  const maxMs = waits[count - 1];
  const withinSla = waits.filter((w) => w <= SLA_MS).length;
  const withinSlaPct = Math.round((withinSla / count) * 10000) / 100;

  return { storeId: opts.storeId, channel, count, abandoned, avgMs, p95Ms, maxMs, withinSlaPct, slaMs: SLA_MS };
}
