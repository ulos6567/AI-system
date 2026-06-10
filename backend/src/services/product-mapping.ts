/**
 * T028 — 상품 매핑 서비스 (FR-004)
 *   - 자동 매핑 후 신뢰도 < 0.7 이면 status='pending' 강제
 *   - 매핑 알고리즘: 1차 정확 매치(이름/바코드) → 2차 substring match → 3차 카테고리 기반 추정
 *   - 본 1차 구현은 substring 기반 단순 휴리스틱. 정확도 향상은 후속 단계.
 */
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';
import { audit } from '../lib/audit';

const CONFIDENCE_THRESHOLD = 0.7;

interface MappingCandidate {
  productMasterId: number;
  confidence: number;
}

async function findCandidate(localName: string, localCode: string): Promise<MappingCandidate | null> {
  const pool = getPool();
  // 1차: barcode 또는 master_code 정확 매치
  const [byCode] = await pool.query<any[]>(
    `SELECT id FROM product_master WHERE master_code = ? OR barcode = ? LIMIT 1`,
    [localCode, localCode],
  );
  if (byCode.length > 0) {
    return { productMasterId: byCode[0].id, confidence: 0.99 };
  }
  // 2차: 이름 substring (LIKE)
  const [byName] = await pool.query<any[]>(
    `SELECT id, name, CHAR_LENGTH(name) AS name_len FROM product_master
       WHERE name LIKE CONCAT('%', ?, '%') OR ? LIKE CONCAT('%', name, '%')
       ORDER BY name_len ASC LIMIT 1`,
    [localName, localName],
  );
  if (byName.length > 0) {
    const overlap = Math.min(byName[0].name_len, localName.length);
    const maxLen = Math.max(byName[0].name_len, localName.length);
    const conf = Math.min(0.95, 0.5 + overlap / maxLen / 2);
    return { productMasterId: byName[0].id, confidence: Math.round(conf * 100) / 100 };
  }
  return null;
}

export async function upsertMapping(opts: {
  storeId: number;
  localCode: string;
  localName: string;
}): Promise<{ productMasterId: number | null; confidence: number; status: string }> {
  const pool = getPool();
  const candidate = await findCandidate(opts.localName, opts.localCode);
  const productMasterId = candidate?.productMasterId ?? null;
  const confidence = candidate?.confidence ?? 0;
  const status = !candidate
    ? 'pending'
    : confidence < CONFIDENCE_THRESHOLD
      ? 'pending'
      : 'auto';

  await pool.query(
    `INSERT INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       local_name = VALUES(local_name),
       product_master_id = CASE WHEN status='confirmed' THEN product_master_id ELSE VALUES(product_master_id) END,
       confidence = CASE WHEN status='confirmed' THEN confidence ELSE VALUES(confidence) END,
       status = CASE WHEN status='confirmed' THEN status ELSE VALUES(status) END`,
    [opts.storeId, opts.localCode, opts.localName, productMasterId, confidence, status],
  );

  if (status === 'pending') {
    await audit({
      storeId: opts.storeId,
      eventType: 'mapping.pending',
      severity: 'warn',
      message: `local_code=${opts.localCode} requires manual review`,
      metadata: { localCode: opts.localCode, localName: opts.localName, confidence },
    });
  }
  logger.debug({ ...opts, productMasterId, confidence, status }, 'mapping upserted');
  return { productMasterId, confidence, status };
}

/**
 * T011a (003) — 표준 매핑 커버리지 리포트 (FR-003, SC-006)
 *   - mapped   = status IN ('auto','confirmed')  (표준 마스터에 매핑 확정/고신뢰 자동)
 *   - unmapped = status IN ('pending','rejected') (미확정 → 검토 필요, 명시)
 *   - coveragePct = mapped / total * 100  (SC-006 목표 ≥ 95)
 *   - 추정값을 확정으로 집계하지 않는다(FR-002): pending은 unmapped로 분류.
 */
export interface MappingCoverage {
  storeId: number;
  total: number;
  mapped: number;
  unmapped: number;
  coveragePct: number;
  byStatus: Record<string, number>;
  unmappedItems: Array<{ localCode: string; localName: string; status: string }>;
}

export async function getMappingCoverage(storeId: number): Promise<MappingCoverage> {
  const pool = getPool();
  const [counts] = await pool.query<any[]>(
    `SELECT status, COUNT(*) AS cnt
       FROM product_local_mapping
      WHERE store_id = ?
      GROUP BY status`,
    [storeId],
  );
  const byStatus: Record<string, number> = {};
  for (const r of counts) byStatus[r.status] = Number(r.cnt);

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const mapped = (byStatus.auto ?? 0) + (byStatus.confirmed ?? 0);
  const unmapped = total - mapped;
  const coveragePct = total > 0 ? Math.round((mapped / total) * 10000) / 100 : 0;

  const [unmappedRows] = await pool.query<any[]>(
    `SELECT local_code AS localCode, local_name AS localName, status
       FROM product_local_mapping
      WHERE store_id = ? AND status IN ('pending','rejected')
      ORDER BY updated_at DESC
      LIMIT 500`,
    [storeId],
  );

  return { storeId, total, mapped, unmapped, coveragePct, byStatus, unmappedItems: unmappedRows };
}

export async function listPendingMappings(storeId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, local_code, local_name, product_master_id, confidence, status, created_at
       FROM product_local_mapping
      WHERE store_id = ? AND status = 'pending'
      ORDER BY created_at DESC`,
    [storeId],
  );
  return rows;
}
