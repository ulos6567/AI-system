/**
 * T060 — GET /api/stores/:storeId/reports/daily
 *           ?from=YYYY-MM-DD &to=YYYY-MM-DD
 *
 *        POST /api/stores/:storeId/reports/backfill
 *           { from, to }   — 누락 날짜 재집계 (시연·복구용)
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import { listDailyReports, backfillRange } from '../services/kpi';

const router = Router({ mergeParams: true });

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return fallback;
  return new Date(`${s.slice(0, 10)}T00:00:00`);
}

router.get('/daily', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const to = parseDate(req.query.to as string | undefined, new Date());
  const defaultFrom = new Date(to);
  defaultFrom.setDate(defaultFrom.getDate() - 27);
  const from = parseDate(req.query.from as string | undefined, defaultFrom);

  const rows = await listDailyReports(storeId, from, to);

  // 집계 요약(기간 합계·평균)
  const summary = rows.reduce(
    (acc, r) => {
      acc.revenue += Number(r.revenue);
      acc.transactionsCount += Number(r.transactionsCount);
      acc.discardAmount += Number(r.discardAmount);
      if (r.forecastMape !== null && r.forecastMape !== undefined) {
        acc.mapeSum += Number(r.forecastMape);
        acc.mapeDays += 1;
      }
      return acc;
    },
    { revenue: 0, transactionsCount: 0, discardAmount: 0, mapeSum: 0, mapeDays: 0 },
  );
  const avgTicket = summary.transactionsCount > 0 ? summary.revenue / summary.transactionsCount : 0;
  const discardRate = summary.revenue + summary.discardAmount > 0
    ? summary.discardAmount / (summary.revenue + summary.discardAmount)
    : 0;
  const avgMape = summary.mapeDays > 0 ? summary.mapeSum / summary.mapeDays : null;

  res.json({
    storeId,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    summary: {
      revenue: Math.round(summary.revenue * 100) / 100,
      transactionsCount: summary.transactionsCount,
      avgTicket: Math.round(avgTicket * 100) / 100,
      discardAmount: Math.round(summary.discardAmount * 100) / 100,
      discardRate: Math.round(discardRate * 10000) / 10000,
      avgMape: avgMape !== null ? Math.round(avgMape * 10000) / 10000 : null,
    },
    series: rows,
  });
});

router.post('/backfill', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const from = parseDate(req.body?.from, new Date(Date.now() - 27 * 86400_000));
  const to = parseDate(req.body?.to, new Date());
  const rows = await backfillRange(storeId, from, to);
  res.json({ storeId, generated: rows.length, series: rows });
});

export default router;
