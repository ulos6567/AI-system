/**
 * 002 (T037) — Vision 히트맵·행동 분석 라우트 (FR-011~013)
 *   GET  /api/stores/:storeId/analytics/heatmap        존별 체류 히트맵(비식별)
 *   GET  /api/stores/:storeId/analytics/insights       존별 관심 행동 통계 + 세그먼트(비식별)
 *   GET  /api/stores/:storeId/analytics/suggestions    배치 개선 제안
 *   POST /api/stores/:storeId/analytics/rebuild        집계 재생성(데모) — 운영자
 *
 *   기존 vision.ts 의 analyticsRouter(/behavior, /zones) 와 동일 base 에 함께 마운트된다.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope, requireAdmin } from '../middleware/rbac';
import { getHeatmap, getBehaviorStats, placementSuggestions, rebuildBehaviorInsights } from '../services/analytics';

const router = Router({ mergeParams: true });

router.get('/heatmap', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, ...(await getHeatmap(storeId)) });
});

router.get('/insights', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, zones: await getBehaviorStats(storeId) });
});

router.get('/suggestions', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, suggestions: await placementSuggestions(storeId) });
});

router.post('/rebuild', requireAuth, requireStoreScope(), requireAdmin, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const zones = await rebuildBehaviorInsights(storeId);
  res.json({ ok: true, storeId, zones });
});

export default router;
