/**
 * T030 — GET /api/stores/{storeId}/forecasts?date=YYYY-MM-DD
 *        POST /api/stores/{storeId}/forecasts/generate { date? }
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { forecastStoreFor, listLatestForecasts } from '../services/forecast';

const router = Router({ mergeParams: true });

function parseDate(s?: string): Date {
  if (s && /^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(`${s.slice(0, 10)}T00:00:00`);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const date = parseDate(req.query.date as string | undefined);
  const rows = await listLatestForecasts(storeId, date);
  res.json({ storeId, targetDate: date.toISOString().slice(0, 10), forecasts: rows });
});

router.post('/generate', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const date = parseDate(req.body?.date);
  const rows = await forecastStoreFor(storeId, date);
  res.json({ storeId, targetDate: date.toISOString().slice(0, 10), generated: rows.length, forecasts: rows });
});

export default router;
