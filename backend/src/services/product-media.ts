/**
 * 002 (T019) — 상품 미디어 서비스 + 대체 이미지(fallback) 리졸버 (FR-009, SC-009)
 *
 *   - `product_media` 에 등록된 실제 상품 이미지를 우선 제공한다.
 *   - 실제 이미지가 없으면 카테고리 기반 대체 이미지(is_fallback)를 제공한다.
 *   - 둘 다 없으면 카테고리 색·이모지로 합성한 SVG data-URI 를 반환한다 →
 *     어떤 상품도 "빈 이미지" 가 되지 않도록 보장(이미지 100%).
 */
import { getPool } from '../db/pool';

export interface ProductMedia {
  id: number;
  productId: number;
  imageUrl: string;
  isFallback: boolean;
  sortOrder: number;
}

export interface ResolvedImage {
  productId: number;
  imageUrl: string;
  isFallback: boolean;
  /** 'real' = product_media 실제 이미지, 'category' = 카테고리 대체, 'generated' = 합성 SVG */
  source: 'real' | 'category' | 'generated';
}

// 카테고리 → 이모지·색 (대체 이미지 합성용)
const CATEGORY_VISUAL: Record<string, { emoji: string; color: string }> = {
  beverage: { emoji: '🥤', color: '#38bdf8' },
  snack: { emoji: '🍪', color: '#f59e0b' },
  lunchbox: { emoji: '🍱', color: '#ef4444' },
  ricesnack: { emoji: '🍙', color: '#10b981' },
  instant: { emoji: '🍜', color: '#f97316' },
  frozen: { emoji: '🧊', color: '#6366f1' },
  default: { emoji: '🛒', color: '#64748b' },
};

export function categoryVisual(category?: string | null): { emoji: string; color: string } {
  return CATEGORY_VISUAL[category ?? 'default'] ?? CATEGORY_VISUAL.default;
}

/** 카테고리 합성 SVG data-URI (네트워크 무의존 — 항상 렌더) */
export function generatedFallback(category?: string | null, label?: string): string {
  const { emoji, color } = categoryVisual(category);
  const text = (label ?? category ?? '상품').slice(0, 14);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">` +
    `<rect width="320" height="240" fill="${color}22"/>` +
    `<rect width="320" height="240" fill="none" stroke="${color}55" stroke-width="2"/>` +
    `<text x="160" y="120" font-size="72" text-anchor="middle">${emoji}</text>` +
    `<text x="160" y="180" font-size="20" fill="${color}" text-anchor="middle" font-family="sans-serif">${escapeXml(text)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  );
}

/** 한 상품의 모든 미디어(정렬: 실제 우선, sort_order) */
export async function getProductMedia(productId: number): Promise<ProductMedia[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, product_id AS productId, image_url AS imageUrl,
            is_fallback AS isFallback, sort_order AS sortOrder
       FROM product_media
      WHERE product_id = ?
      ORDER BY is_fallback ASC, sort_order ASC, id ASC`,
    [productId],
  );
  return rows.map((r) => ({ ...r, isFallback: !!r.isFallback }));
}

/** 단일 상품의 대표 이미지 리졸브: 실제 → 카테고리 대체 → 합성 SVG */
export async function resolveImage(productId: number): Promise<ResolvedImage> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT pm.image_url AS imageUrl, pm.is_fallback AS isFallback, p.category, p.name
       FROM product_master p
       LEFT JOIN product_media pm ON pm.product_id = p.id
      WHERE p.id = ?
      ORDER BY pm.is_fallback ASC, pm.sort_order ASC, pm.id ASC`,
    [productId],
  );
  const category = rows[0]?.category ?? null;
  const name = rows[0]?.name ?? null;
  const real = rows.find((r) => r.imageUrl && !r.isFallback);
  if (real) return { productId, imageUrl: real.imageUrl, isFallback: false, source: 'real' };
  const fallback = rows.find((r) => r.imageUrl && r.isFallback);
  if (fallback) return { productId, imageUrl: fallback.imageUrl, isFallback: true, source: 'category' };
  return { productId, imageUrl: generatedFallback(category, name), isFallback: true, source: 'generated' };
}

/** 점포의 모든 상품 대표 이미지 일괄 리졸브(대시보드·목록용, 빈 이미지 0건 보장) */
export async function resolveImagesForStore(storeId: number): Promise<Record<number, ResolvedImage>> {
  const pool = getPool();
  // 점포에 매핑된 상품 + 전체 마스터(데모는 마스터 전체 노출) — 실제 이미지 우선 조인
  const [rows] = await pool.query<any[]>(
    `SELECT p.id AS productId, p.category, p.name,
            pm.image_url AS imageUrl, pm.is_fallback AS isFallback
       FROM product_master p
       LEFT JOIN product_media pm ON pm.product_id = p.id
      ORDER BY p.id, pm.is_fallback ASC, pm.sort_order ASC, pm.id ASC`,
    [],
  );
  void storeId;
  const byProduct = new Map<number, any[]>();
  for (const r of rows) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
    byProduct.get(r.productId)!.push(r);
  }
  const out: Record<number, ResolvedImage> = {};
  for (const [pid, list] of byProduct) {
    const real = list.find((r) => r.imageUrl && !r.isFallback);
    if (real) {
      out[pid] = { productId: pid, imageUrl: real.imageUrl, isFallback: false, source: 'real' };
      continue;
    }
    const fb = list.find((r) => r.imageUrl && r.isFallback);
    out[pid] = fb
      ? { productId: pid, imageUrl: fb.imageUrl, isFallback: true, source: 'category' }
      : { productId: pid, imageUrl: generatedFallback(list[0]?.category, list[0]?.name), isFallback: true, source: 'generated' };
  }
  return out;
}
