/**
 * T064 동반 — 셀프 결제 화면용 상품 검색
 *   GET /api/stores/:storeId/products/lookup?q=local_code|barcode|name
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPool } from '../db/pool';
import { getProductMedia, resolveImage, resolveImagesForStore } from '../services/product-media';

const router = Router({ mergeParams: true });

/**
 * 002 (T020) — 상품 미디어 (실제 이미지 우선, 없으면 카테고리 대체, FR-009)
 *   GET /api/stores/:storeId/products/media           점포 전 상품 대표 이미지 일괄 (대시보드용)
 *   GET /api/stores/:storeId/products/:id/media        단일 상품 미디어 + 대표 이미지 리졸브
 */
router.get('/media', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  res.json({ storeId, images: await resolveImagesForStore(storeId) });
});

router.get('/:id/media', requireAuth, requireStoreScope(), async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) {
    res.status(400).json({ error: 'invalid_product_id' });
    return;
  }
  const [media, resolved] = await Promise.all([getProductMedia(productId), resolveImage(productId)]);
  res.json({ productId, resolved, media });
});

router.get('/lookup', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 1) {
    res.status(400).json({ error: 'missing_q' });
    return;
  }
  const pool = getPool();
  // 1차: 점포 로컬 코드 정확 매치 (바코드 시뮬레이션)
  const [exact] = await pool.query<any[]>(
    `SELECT plm.local_code AS localCode, plm.local_name AS localName,
            plm.product_master_id AS productMasterId, pm.name AS productName,
            pm.category, pm.barcode
       FROM product_local_mapping plm
       JOIN product_master pm ON pm.id = plm.product_master_id
      WHERE plm.store_id = ?
        AND (plm.local_code = ? OR pm.barcode = ?)
        AND plm.status IN ('auto','confirmed')
      LIMIT 5`,
    [storeId, q, q],
  );
  if (exact.length > 0) {
    res.json({ storeId, q, results: exact, exactMatch: true });
    return;
  }
  // 2차: 이름 부분 일치
  const [partial] = await pool.query<any[]>(
    `SELECT plm.local_code AS localCode, plm.local_name AS localName,
            plm.product_master_id AS productMasterId, pm.name AS productName,
            pm.category, pm.barcode
       FROM product_local_mapping plm
       JOIN product_master pm ON pm.id = plm.product_master_id
      WHERE plm.store_id = ?
        AND plm.status IN ('auto','confirmed')
        AND (plm.local_name LIKE CONCAT('%', ?, '%') OR pm.name LIKE CONCAT('%', ?, '%'))
      LIMIT 20`,
    [storeId, q, q],
  );
  res.json({ storeId, q, results: partial, exactMatch: false });
});

export default router;
