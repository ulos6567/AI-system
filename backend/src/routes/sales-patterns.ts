/**
 * 판매 패턴 분석 라우트 — /api/stores/:storeId/sales-patterns
 *   GET /heatmap  요일×시간대 거래 히트맵(피크 분석)
 *   GET /basket   장바구니 연관분석(함께 팔리는 상품쌍)
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPeakHeatmap, getBasketAnalysis } from '../services/sales-patterns';

const router = Router({ mergeParams: true });

router.get('/heatmap', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, ...(await getPeakHeatmap(storeId)) });
});

router.get('/basket', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, ...(await getBasketAnalysis(storeId)) });
});

export default router;
