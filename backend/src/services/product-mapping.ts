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
