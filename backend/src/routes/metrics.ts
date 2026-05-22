/**
 * T079 — 헬스체크·메트릭
 *   GET /api/metrics           — JSON 형태 운영 지표(스크레이프 가능)
 *   /api/healthz, /api/readyz  — index.ts 에서 제공
 */
import { Router } from 'express';
import { getPool } from '../db/pool';
import { isOnline, bufferedCount } from '../services/local-buffer';
import { logger } from '../lib/logger';

const router = Router();

router.get('/metrics', async (_req, res) => {
  const start = Date.now();
  let dbOk = false;
  let counts: Record<string, number> = {};
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    dbOk = true;
    const [rows] = await pool.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM \`user\`)                    AS users,
         (SELECT COUNT(*) FROM store WHERE status='active') AS activeStores,
         (SELECT COUNT(*) FROM purchase_order WHERE status='pending_review') AS ordersPendingReview,
         (SELECT COUNT(*) FROM purchase_order WHERE status='sent' AND DATE(sent_at) = CURRENT_DATE) AS ordersSentToday,
         (SELECT COUNT(*) FROM event_log WHERE severity IN ('error','critical') AND occurred_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS errorsLast24h,
         (SELECT COUNT(*) FROM notification WHERE read_at IS NULL) AS notificationsUnread`,
    );
    counts = rows[0] ?? {};
  } catch (err: any) {
    logger.warn({ err: err.message }, 'metrics db probe failed');
  }
  const mem = process.memoryUsage();
  res.json({
    ts: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    db: { ok: dbOk, online: isOnline(), bufferedTransactions: bufferedCount() },
    counts: {
      users: Number(counts.users ?? 0),
      activeStores: Number(counts.activeStores ?? 0),
      ordersPendingReview: Number(counts.ordersPendingReview ?? 0),
      ordersSentToday: Number(counts.ordersSentToday ?? 0),
      errorsLast24h: Number(counts.errorsLast24h ?? 0),
      notificationsUnread: Number(counts.notificationsUnread ?? 0),
    },
    process: {
      memMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
      pid: process.pid,
      node: process.version,
    },
    probedMs: Date.now() - start,
  });
});

export default router;
