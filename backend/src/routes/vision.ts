/**
 * T063 동반 — Vision 캡처 제어 + analytics 조회
 *   POST /api/stores/:storeId/vision/start
 *   POST /api/stores/:storeId/vision/stop
 *   GET  /api/stores/:storeId/vision/status
 *   GET  /api/stores/:storeId/analytics/behavior?limit=
 *   GET  /api/stores/:storeId/analytics/zones    — 존별 dwell 집계
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import { getVisionAdapter } from '../adapters/factory';
import { isCapturing } from '../adapters/vision/mock';
import { getPool } from '../db/pool';

const visionRouter = Router({ mergeParams: true });
const analyticsRouter = Router({ mergeParams: true });

visionRouter.post('/start', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const adapter = getVisionAdapter();
  await adapter.startCapture(storeId, async () => undefined);
  res.json({ ok: true, storeId, capturing: true });
});

visionRouter.post('/stop', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const adapter = getVisionAdapter();
  await adapter.stopCapture(storeId);
  res.json({ ok: true, storeId, capturing: false });
});

visionRouter.get('/status', requireAuth, requireStoreScope(), (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, capturing: isCapturing(storeId) });
});

analyticsRouter.get('/behavior', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const limit = Math.min(500, Number(req.query.limit ?? 100));
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT acb.id, acb.anon_session_id AS sessionId, acb.event_type AS eventType,
            acb.zone_code AS zoneCode, acb.product_master_id AS productMasterId,
            pm.name AS productName, acb.dwell_seconds AS dwellSeconds,
            acb.occurred_at AS occurredAt
       FROM analytics_customer_behavior acb
       LEFT JOIN product_master pm ON pm.id = acb.product_master_id
      WHERE acb.store_id = ?
      ORDER BY acb.occurred_at DESC
      LIMIT ?`,
    [storeId, limit],
  );
  res.json({ storeId, events: rows });
});

analyticsRouter.get('/zones', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT zone_code AS zoneCode,
            COUNT(*) AS events,
            SUM(CASE WHEN event_type = 'dwell' THEN COALESCE(dwell_seconds, 0) ELSE 0 END) AS dwellSeconds,
            SUM(CASE WHEN event_type = 'pickup' THEN 1 ELSE 0 END) AS pickups,
            COUNT(DISTINCT anon_session_id) AS uniqueSessions
       FROM analytics_customer_behavior
      WHERE store_id = ? AND occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY zone_code
      ORDER BY events DESC`,
    [storeId],
  );
  res.json({ storeId, zones: rows });
});

export { visionRouter, analyticsRouter };
