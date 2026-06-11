/**
 * 002 (T010~T012, T015) — 처방 생성·승인 실행·검증 서비스 (FR-002~006)
 *
 *   핵심 정책: 처방은 항상 'proposed' 로 생성되고, 점주(운영자) 승인으로만 실행된다.
 *   자동 실행 경로는 존재하지 않는다 (FR-003, Clarify 결정).
 *
 *   승인(approve) 시 action_type 에 따라:
 *     - price_markdown / promotion(상품 지정) → pricing_event 적재(001 가격 인프라 재사용)
 *     - sales_drop 대응 store_promotion(상품 미지정) → 실행 참조만 기록
 *     - reorder / staffing → 실행 참조 placeholder (후속 연동)
 *
 *   승인 시 baseline 스냅샷을 action_outcome 에 저장하고, action-verify 잡이
 *   검증 기간(기본 1일) 경과 후 actual 과 비교해 적중 여부를 채운다.
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';
import { detectSignals, type DetectedSignal } from './signal-detect';

const VERIFY_WINDOW_DAYS = 1;
const BASELINE_WINDOW_DAYS = 7;

// --- 신호 → 처방 매핑 -------------------------------------------------------

interface ActionDraft {
  actionType: 'price_markdown' | 'promotion' | 'reorder' | 'reallocate' | 'staffing';
  targetProductId: number | null;
  recommendation: Record<string, unknown>;
  expectedEffect: Record<string, unknown>;
  rationale: string;
  confidence: number;
}

const CAT_KO: Record<string, string> = {
  beverage: '음료',
  snack: '스낵',
  frozen: '아이스크림',
  ricesnack: '삼각김밥',
  instant: '컵라면',
  lunchbox: '도시락',
};

/** 하나의 신호에서 0개 이상의 처방 초안을 만든다(수요 급증은 재발주+인력 2건). */
function draftsFromSignal(s: DetectedSignal): ActionDraft[] {
  switch (s.signalType) {
    case 'waste_risk': {
      const name = (s.payload as any).productName ?? `#${s.productId}`;
      return [
        {
          actionType: 'price_markdown',
          targetProductId: s.productId,
          recommendation: { percent: 30, durationHours: 6, channel: ['esl', 'push'] },
          expectedEffect: { metric: 'units_sold', expectedUpliftPct: 40 },
          rationale: `${name} 유통기한 임박(잔여 ${(s.payload as any).daysToExpiry}일, 재고 ${(s.payload as any).quantity}) — 폐기 위험. 30% 인하로 소진 권장.`,
          confidence: 0.8,
        },
      ];
    }
    case 'overstock': {
      const name = (s.payload as any).productName ?? `#${s.productId}`;
      return [
        {
          actionType: 'price_markdown',
          targetProductId: s.productId,
          recommendation: { percent: 20, durationHours: 8, channel: ['esl'] },
          expectedEffect: { metric: 'units_sold', expectedUpliftPct: 25 },
          rationale: `${name} 재고 과다(예상 소진 ${(s.payload as any).daysOfSupply}일분) — 20% 인하로 회전율 개선 권장.`,
          confidence: 0.6,
        },
      ];
    }
    case 'sales_drop': {
      return [
        {
          actionType: 'promotion',
          targetProductId: null,
          recommendation: { type: 'store_promotion', message: '당일 한정 프로모션', durationHours: 8 },
          expectedEffect: { metric: 'revenue', expectedUpliftPct: 15 },
          rationale: `최근 ${(s.payload as any).windowDays}일 매출이 직전 동기 대비 ${(s.payload as any).dropPct}% 감소 — 당일 한정 프로모션으로 매출 방어 권장.`,
          confidence: 0.5,
        },
      ];
    }
    case 'demand_surge': {
      const p = s.payload as any;
      const catKo = (p.categories as string[]).map((c) => CAT_KO[c] ?? c).join('·');
      const dlabel = p.daysUntilStart === 0 ? '진행중' : `D-${p.daysUntilStart}`;
      return [
        {
          actionType: 'reorder',
          targetProductId: null,
          recommendation: { categories: p.categories, upliftPct: p.upliftPct, window: `${p.startDate}~${p.endDate}` },
          expectedEffect: { metric: 'units_sold', expectedUpliftPct: p.upliftPct },
          rationale: `${p.university} ${p.title}(${dlabel}) — ${catKo} 수요 급증 예상. 해당 카테고리 재발주 +${p.upliftPct}% 권장.`,
          confidence: 0.9,
        },
        {
          actionType: 'staffing',
          targetProductId: null,
          recommendation: { peakHours: p.peakHours ?? null, addStaff: 1 },
          expectedEffect: { metric: 'revenue', expectedUpliftPct: Math.max(5, Math.round(p.upliftPct / 4)) },
          rationale: `${p.university} ${p.title} 피크 ${p.peakHours ?? '저녁'} — 계산·진열 보충 인력 1명 증원으로 대기·결품 방지 권장.`,
          confidence: 0.85,
        },
      ];
    }
    default:
      return [];
  }
}

function priorityOf(severity: number, confidence: number): number {
  return severity * 100 + Math.round(confidence * 10);
}

// --- 신호·처방 생성 ---------------------------------------------------------

async function signalExistsToday(s: DetectedSignal): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM operational_signal
      WHERE store_id = ? AND signal_type = ?
        AND ((product_id IS NULL AND ? IS NULL) OR product_id = ?)
        AND DATE(detected_at) = CURRENT_DATE
        AND status = 'open'
      LIMIT 1`,
    [s.storeId, s.signalType, s.productId, s.productId],
  );
  return rows.length > 0;
}

/** 한 점포의 신호를 탐지·적재하고 처방을 생성한다. 생성된 처방 수를 반환. */
export async function generateForStore(storeId: number): Promise<{ signals: number; actions: number }> {
  const detected = await detectSignals(storeId);
  const pool = getPool();
  let signalCount = 0;
  let actionCount = 0;

  for (const s of detected) {
    if (await signalExistsToday(s)) continue;
    const [sigRes]: any = await pool.query(
      `INSERT INTO operational_signal (store_id, signal_type, severity, product_id, detected_at, payload_json, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [s.storeId, s.signalType, s.severity, s.productId, s.detectedAt, JSON.stringify(s.payload)],
    );
    const signalId = sigRes.insertId as number;
    signalCount++;

    for (const draft of draftsFromSignal(s)) {
      await pool.query(
        `INSERT INTO prescriptive_action
           (signal_id, store_id, action_type, target_product_id, recommendation_json,
            expected_effect_json, rationale, confidence, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')`,
        [
          signalId,
          s.storeId,
          draft.actionType,
          draft.targetProductId,
          JSON.stringify(draft.recommendation),
          JSON.stringify(draft.expectedEffect),
          draft.rationale,
          draft.confidence,
          priorityOf(s.severity, draft.confidence),
        ],
      );
      actionCount++;
    }
  }
  return { signals: signalCount, actions: actionCount };
}

// --- 조회 -------------------------------------------------------------------

export async function listSignals(storeId: number, status?: string): Promise<any[]> {
  const pool = getPool();
  const args: any[] = [storeId];
  let where = 'store_id = ?';
  if (status) {
    where += ' AND status = ?';
    args.push(status);
  }
  const [rows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, signal_type AS signalType, severity,
            product_id AS productId, detected_at AS detectedAt,
            payload_json AS payload, status
       FROM operational_signal
      WHERE ${where}
      ORDER BY detected_at DESC LIMIT 200`,
    args,
  );
  return rows;
}

export async function listActions(storeId: number, status?: string): Promise<any[]> {
  const pool = getPool();
  const args: any[] = [storeId];
  let where = 'pa.store_id = ?';
  if (status) {
    where += ' AND pa.status = ?';
    args.push(status);
  }
  const [rows] = await pool.query<any[]>(
    `SELECT pa.id, pa.signal_id AS signalId, pa.store_id AS storeId,
            pa.action_type AS actionType, pa.target_product_id AS targetProductId,
            pm.name AS targetProductName,
            pa.recommendation_json AS recommendation, pa.expected_effect_json AS expectedEffect,
            pa.rationale, pa.confidence, pa.priority, pa.status,
            pa.approved_by AS approvedBy, pa.approved_at AS approvedAt,
            pa.executed_ref_json AS executedRef, pa.reject_reason AS rejectReason,
            pa.created_at AS createdAt
       FROM prescriptive_action pa
       LEFT JOIN product_master pm ON pm.id = pa.target_product_id
      WHERE ${where}
      ORDER BY pa.status = 'proposed' DESC, pa.priority DESC, pa.created_at DESC
      LIMIT 200`,
    args,
  );
  return rows;
}

// --- 실행 헬퍼 (001 가격 인프라 재사용) -------------------------------------

async function lastUnitPrice(storeId: number, productId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT ti.unit_price FROM transaction_item ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
      WHERE t.store_id = ? AND ti.product_master_id = ?
      ORDER BY t.occurred_at DESC LIMIT 1`,
    [storeId, productId],
  );
  return rows.length ? Number(rows[0].unit_price) : 0;
}

/** AI 처방 전용 시스템 가격 룰을 찾거나 생성한다(수동 트리거). */
async function ensurePrescriptionRule(storeId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM pricing_rule WHERE store_id = ? AND name = 'AI 처방 (자동생성)' LIMIT 1`,
    [storeId],
  );
  if (rows.length) return Number(rows[0].id);
  const [res]: any = await pool.query(
    `INSERT INTO pricing_rule (store_id, name, trigger_type, trigger_config_json, action_type, action_config_json, is_active)
     VALUES (?, 'AI 처방 (자동생성)', 'manual', NULL, 'percent_off', NULL, TRUE)`,
    [storeId],
  );
  return res.insertId as number;
}

async function executeMarkdown(
  storeId: number,
  productId: number,
  percent: number,
  durationHours: number,
): Promise<{ pricingEventId: number; originalPrice: number; adjustedPrice: number } | null> {
  const original = await lastUnitPrice(storeId, productId);
  if (original <= 0) return null;
  const adjusted = Math.max(0, Math.round(original * (1 - percent / 100)));
  if (adjusted >= original) return null;
  const ruleId = await ensurePrescriptionRule(storeId);
  const from = new Date();
  const to = new Date(from.getTime() + durationHours * 3600_000);
  const pool = getPool();
  const [res]: any = await pool.query(
    `INSERT INTO pricing_event
       (store_id, product_master_id, pricing_rule_id, original_price, adjusted_price,
        effective_from, effective_to, esl_push_status, audit_meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      storeId,
      productId,
      ruleId,
      original,
      adjusted,
      from,
      to,
      JSON.stringify({ source: 'prescriptive_action', percent }),
    ],
  );
  return { pricingEventId: res.insertId as number, originalPrice: original, adjustedPrice: adjusted };
}

// --- baseline 스냅샷 --------------------------------------------------------

async function captureBaseline(action: any): Promise<Record<string, unknown>> {
  const pool = getPool();
  const expected = parseJson(action.expected_effect_json) ?? {};
  const metric = expected.metric ?? 'units_sold';
  if (action.target_product_id && metric === 'units_sold') {
    const [rows] = await pool.query<any[]>(
      `SELECT COALESCE(SUM(ti.quantity), 0) / ? AS dailyValue
         FROM transaction_item ti JOIN \`transaction\` t ON t.id = ti.transaction_id
        WHERE t.store_id = ? AND ti.product_master_id = ?
          AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [BASELINE_WINDOW_DAYS, action.store_id, action.target_product_id, BASELINE_WINDOW_DAYS],
    );
    return { metric, baselineDaily: Number(rows[0]?.dailyValue ?? 0), expectedUpliftPct: expected.expectedUpliftPct ?? 0 };
  }
  // store-level revenue
  const [rows] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(t.total_amount), 0) / ? AS dailyValue
       FROM \`transaction\` t
      WHERE t.store_id = ? AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [BASELINE_WINDOW_DAYS, action.store_id, BASELINE_WINDOW_DAYS],
  );
  return { metric: 'revenue', baselineDaily: Number(rows[0]?.dailyValue ?? 0), expectedUpliftPct: expected.expectedUpliftPct ?? 0 };
}

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

// --- 승인/거절 --------------------------------------------------------------

export async function approveAction(
  actionId: number,
  userId: number,
  overrides?: { percent?: number; durationHours?: number },
): Promise<any> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(`SELECT * FROM prescriptive_action WHERE id = ?`, [actionId]);
  if (!rows.length) throw new Error('action_not_found');
  const action = rows[0];
  if (action.status !== 'proposed') {
    const e: any = new Error('action_not_pending');
    e.code = 'conflict';
    throw e;
  }

  const rec = { ...(parseJson(action.recommendation_json) ?? {}), ...(overrides ?? {}) };
  let executedRef: Record<string, unknown> = { type: action.action_type };

  if ((action.action_type === 'price_markdown' || action.action_type === 'promotion') && action.target_product_id) {
    const r = await executeMarkdown(
      action.store_id,
      action.target_product_id,
      Number(rec.percent ?? 20),
      Number(rec.durationHours ?? 6),
    );
    if (r) {
      executedRef = { type: 'pricing_event', ...r };
    } else {
      executedRef = { type: action.action_type, note: 'no_price_baseline' };
    }
  } else if (action.action_type === 'promotion') {
    executedRef = { type: 'store_promotion', message: rec.message ?? '당일 한정 프로모션' };
  } else {
    executedRef = { type: action.action_type, note: 'recorded_only' };
  }

  const now = new Date();
  await pool.query(
    `UPDATE prescriptive_action
        SET status = 'executed', approved_by = ?, approved_at = ?, executed_ref_json = ?
      WHERE id = ?`,
    [userId, now, JSON.stringify(executedRef), actionId],
  );
  await pool.query(`UPDATE operational_signal SET status = 'actioned' WHERE id = ?`, [action.signal_id]);

  // baseline 스냅샷 저장 (검증 대기)
  const baseline = await captureBaseline(action);
  await pool.query(
    `INSERT INTO action_outcome (action_id, baseline_json) VALUES (?, ?)`,
    [actionId, JSON.stringify(baseline)],
  );

  await audit({
    storeId: action.store_id,
    userId,
    eventType: 'action_approved',
    message: `처방 #${actionId} 승인·실행 (${action.action_type})`,
    metadata: { actionId, executedRef },
  });
  await audit({
    storeId: action.store_id,
    userId,
    eventType: 'action_executed',
    severity: 'info',
    message: `처방 #${actionId} 실행`,
    metadata: { actionId, executedRef },
  });

  const [updated] = await pool.query<any[]>(`SELECT * FROM prescriptive_action WHERE id = ?`, [actionId]);
  return updated[0];
}

export async function rejectAction(actionId: number, userId: number, reason: string): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(`SELECT * FROM prescriptive_action WHERE id = ?`, [actionId]);
  if (!rows.length) throw new Error('action_not_found');
  const action = rows[0];
  if (action.status !== 'proposed') {
    const e: any = new Error('action_not_pending');
    e.code = 'conflict';
    throw e;
  }
  await pool.query(
    `UPDATE prescriptive_action SET status = 'rejected', reject_reason = ?, approved_by = ? WHERE id = ?`,
    [reason, userId, actionId],
  );
  await pool.query(`UPDATE operational_signal SET status = 'dismissed' WHERE id = ?`, [action.signal_id]);
  await audit({
    storeId: action.store_id,
    userId,
    eventType: 'action_rejected',
    message: `처방 #${actionId} 거절: ${reason}`,
    metadata: { actionId, reason },
  });
}

// --- 효과 검증 (closed-loop) ------------------------------------------------

export async function getOutcome(actionId: number): Promise<any | null> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT action_id AS actionId, baseline_json AS baseline, actual_json AS actual,
            accuracy, hit, verified_at AS verifiedAt
       FROM action_outcome WHERE action_id = ? ORDER BY id DESC LIMIT 1`,
    [actionId],
  );
  return rows.length ? rows[0] : null;
}

/** 검증 기간이 지난 실행 처방들의 실제 효과를 계산해 action_outcome 을 채운다. */
export async function verifyDueActions(): Promise<number> {
  const pool = getPool();
  const [due] = await pool.query<any[]>(
    `SELECT pa.id AS actionId, pa.store_id AS storeId, pa.target_product_id AS productId,
            pa.approved_at AS approvedAt, ao.id AS outcomeId, ao.baseline_json AS baseline
       FROM prescriptive_action pa
       JOIN action_outcome ao ON ao.action_id = pa.id AND ao.verified_at IS NULL
      WHERE pa.status = 'executed'
        AND pa.approved_at <= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [VERIFY_WINDOW_DAYS],
  );

  let verified = 0;
  for (const row of due) {
    const baseline = parseJson(row.baseline) ?? {};
    const metric = baseline.metric ?? 'units_sold';
    const expectedUplift = Number(baseline.expectedUpliftPct ?? 0);
    const baselineDaily = Number(baseline.baselineDaily ?? 0);

    let actualValue = 0;
    if (row.productId && metric === 'units_sold') {
      const [r] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(ti.quantity), 0) AS v
           FROM transaction_item ti JOIN \`transaction\` t ON t.id = ti.transaction_id
          WHERE t.store_id = ? AND ti.product_master_id = ?
            AND t.occurred_at >= ? AND t.occurred_at < DATE_ADD(?, INTERVAL ? DAY)`,
        [row.storeId, row.productId, row.approvedAt, row.approvedAt, VERIFY_WINDOW_DAYS],
      );
      actualValue = Number(r[0]?.v ?? 0);
    } else {
      const [r] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(t.total_amount), 0) AS v FROM \`transaction\` t
          WHERE t.store_id = ? AND t.occurred_at >= ? AND t.occurred_at < DATE_ADD(?, INTERVAL ? DAY)`,
        [row.storeId, row.approvedAt, row.approvedAt, VERIFY_WINDOW_DAYS],
      );
      actualValue = Number(r[0]?.v ?? 0);
    }

    const actualUplift = baselineDaily > 0 ? ((actualValue - baselineDaily) / baselineDaily) * 100 : 0;
    const diff = Math.abs(actualUplift - expectedUplift);
    const hit = diff <= 20; // ±20%p (SC-002)
    const accuracy = Math.max(0, 1 - diff / Math.max(expectedUplift, 1));

    await pool.query(
      `UPDATE action_outcome
          SET actual_json = ?, accuracy = ?, hit = ?, verified_at = NOW()
        WHERE id = ?`,
      [
        JSON.stringify({ actualValue, actualUpliftPct: Math.round(actualUplift * 10) / 10 }),
        Math.round(accuracy * 1000) / 1000,
        hit ? 1 : 0,
        row.outcomeId,
      ],
    );
    verified++;
  }
  if (verified > 0) logger.info({ verified }, 'prescription outcomes verified');
  return verified;
}

// --- 오늘의 운영 브리핑 (KPI 헤더) ------------------------------------------

export interface DailyBriefing {
  todayRevenue: number;
  todayTx: number;
  avgTicket: number;
  vsYesterdayPct: number | null;
  vsLastWeekPct: number | null;
  projectedClose: number;
  openSignals: number;
  proposedActions: number;
  wasteRiskAmount: number;
  wasteRiskItems: number;
  wasteRiskUnits: number;
}

/** 상단 KPI 요약: 오늘 매출·객단가·예상 마감·알림/폐기 위험. 시간대 페이스로 마감 매출 추정. */
export async function getBriefing(storeId: number): Promise<DailyBriefing> {
  const pool = getPool();
  const [rev] = await pool.query<any[]>(
    `SELECT
        COALESCE(SUM(CASE WHEN DATE(occurred_at)=CURRENT_DATE THEN total_amount END),0) AS today,
        COUNT(CASE WHEN DATE(occurred_at)=CURRENT_DATE THEN 1 END) AS todayTx,
        COALESCE(SUM(CASE WHEN DATE(occurred_at)=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) THEN total_amount END),0) AS yday,
        COALESCE(SUM(CASE WHEN DATE(occurred_at)=DATE_SUB(CURRENT_DATE,INTERVAL 7 DAY) THEN total_amount END),0) AS lastWeek
       FROM \`transaction\` WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL 8 DAY)`,
    [storeId],
  );
  const [pace] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(CASE WHEN HOUR(occurred_at) <= HOUR(NOW()) THEN total_amount END),0) AS upto,
            COALESCE(SUM(total_amount),0) AS allday
       FROM \`transaction\`
      WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL 14 DAY) AND occurred_at < CURRENT_DATE`,
    [storeId],
  );
  const [sig] = await pool.query<any[]>(
    `SELECT COUNT(*) c FROM operational_signal WHERE store_id=? AND status='open'`,
    [storeId],
  );
  const [act] = await pool.query<any[]>(
    `SELECT COUNT(*) c FROM prescriptive_action WHERE store_id=? AND status='proposed'`,
    [storeId],
  );
  const [waste] = await pool.query<any[]>(
    `SELECT COUNT(*) AS items, COALESCE(SUM(i.quantity),0) AS units,
            COALESCE(SUM(i.quantity * COALESCE(
              (SELECT ti.unit_price FROM transaction_item ti JOIN \`transaction\` t ON t.id=ti.transaction_id
                WHERE t.store_id=i.store_id AND ti.product_master_id=i.product_master_id
                ORDER BY t.occurred_at DESC LIMIT 1), 0)),0) AS amount
       FROM inventory i
      WHERE i.store_id=? AND i.expires_at IS NOT NULL
        AND i.expires_at <= DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY) AND i.quantity>0`,
    [storeId],
  );

  const today = Number(rev[0].today);
  const yday = Number(rev[0].yday);
  const lastWeek = Number(rev[0].lastWeek);
  const todayTx = Number(rev[0].todayTx);
  const share = Number(pace[0].allday) > 0 ? Number(pace[0].upto) / Number(pace[0].allday) : 1;
  const projectedClose = share > 0.05 ? Math.round(today / share) : today;
  return {
    todayRevenue: today,
    todayTx,
    avgTicket: todayTx > 0 ? Math.round(today / todayTx) : 0,
    vsYesterdayPct: yday > 0 ? Math.round(((today - yday) / yday) * 1000) / 10 : null,
    vsLastWeekPct: lastWeek > 0 ? Math.round(((today - lastWeek) / lastWeek) * 1000) / 10 : null,
    projectedClose,
    openSignals: Number(sig[0].c),
    proposedActions: Number(act[0].c),
    wasteRiskAmount: Number(waste[0].amount),
    wasteRiskItems: Number(waste[0].items),
    wasteRiskUnits: Number(waste[0].units),
  };
}

// --- 처방 효과 ROI 롤업 -----------------------------------------------------

export interface RoiSummary {
  period: string;
  executed: number;
  verified: number;
  hits: number;
  hitRate: number | null;
  estValueWon: number;
  addedUnits: number;
}

/** 최근 7일 적용 처방의 누적 효과: 적중률 + 추정 추가매출(₩)·추가 판매량. */
export async function getRoi(storeId: number): Promise<RoiSummary> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT ao.baseline_json AS baseline, ao.actual_json AS actual, ao.hit AS hit, ao.verified_at AS verifiedAt,
            pa.expected_effect_json AS expected,
            (SELECT ti.unit_price FROM transaction_item ti JOIN \`transaction\` t ON t.id=ti.transaction_id
              WHERE t.store_id=pa.store_id AND ti.product_master_id=pa.target_product_id
              ORDER BY t.occurred_at DESC LIMIT 1) AS recentPrice
       FROM prescriptive_action pa
       JOIN action_outcome ao ON ao.action_id = pa.id
      WHERE pa.store_id=? AND pa.status='executed' AND pa.approved_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [storeId],
  );
  let verified = 0;
  let hits = 0;
  let estValueWon = 0;
  let addedUnits = 0;
  for (const r of rows) {
    if (r.verifiedAt) verified++;
    if (Number(r.hit) === 1) hits++;
    const base = parseJson(r.baseline) ?? {};
    const act = parseJson(r.actual);
    const exp = parseJson(r.expected) ?? {};
    const uplift = Number(act?.actualUpliftPct ?? base.expectedUpliftPct ?? exp.expectedUpliftPct ?? 0);
    const baseDaily = Number(base.baselineDaily ?? 0);
    const added = baseDaily * (uplift / 100);
    if ((base.metric ?? 'units_sold') === 'revenue') {
      estValueWon += added;
    } else {
      addedUnits += added;
      estValueWon += added * Number(r.recentPrice ?? 0);
    }
  }
  return {
    period: '최근 7일',
    executed: rows.length,
    verified,
    hits,
    hitRate: verified > 0 ? Math.round((hits / verified) * 100) : null,
    estValueWon: Math.round(estValueWon),
    addedUnits: Math.round(addedUnits),
  };
}

// --- 마크다운 시뮬레이터 (What-if) ------------------------------------------

export interface MarkdownSimulation {
  applicable: boolean;
  percent?: number;
  durationHours?: number;
  currentQty?: number;
  unitPrice?: number;
  adjustedPrice?: number;
  dailyUnits?: number;
  projectedDailyUnits?: number;
  projectedUpliftPct?: number;
  daysToSellOut?: number | null;
  unitsInWindow?: number;
  revenueInWindow?: number;
  discountCost?: number;
}

/** 가격 인하 처방을 인하율·기간을 바꿔가며 예상 효과(소진일·창내 판매·할인비용)를 추정. */
export async function simulateAction(
  actionId: number,
  percent: number,
  durationHours: number,
): Promise<MarkdownSimulation> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(`SELECT * FROM prescriptive_action WHERE id = ?`, [actionId]);
  if (!rows.length) throw new Error('action_not_found');
  const a = rows[0];
  if (a.action_type !== 'price_markdown' || !a.target_product_id) return { applicable: false };

  const storeId = a.store_id;
  const pid = a.target_product_id;
  const unitPrice = await lastUnitPrice(storeId, pid);
  const [inv] = await pool.query<any[]>(
    `SELECT COALESCE(quantity,0) AS q FROM inventory WHERE store_id=? AND product_master_id=? LIMIT 1`,
    [storeId, pid],
  );
  const currentQty = Number(inv[0]?.q ?? 0);
  const [du] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(ti.quantity),0)/7 AS daily
       FROM transaction_item ti JOIN \`transaction\` t ON t.id=ti.transaction_id
      WHERE t.store_id=? AND ti.product_master_id=? AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [storeId, pid],
  );
  const dailyUnits = Number(du[0]?.daily ?? 0);
  const rec = parseJson(a.recommendation_json) ?? {};
  const exp = parseJson(a.expected_effect_json) ?? {};
  const recPercent = Number(rec.percent ?? 20);
  const baseUplift = Number(exp.expectedUpliftPct ?? 30);
  const k = recPercent > 0 ? baseUplift / recPercent : 1.5; // 인하율 1%p당 판매 상승률
  const projUplift = Math.max(0, percent * k);
  const projectedDaily = dailyUnits * (1 + projUplift / 100);
  const adjustedPrice = Math.max(0, Math.round(unitPrice * (1 - percent / 100)));
  const unitsInWindow = Math.min(currentQty, Math.round(projectedDaily * (durationHours / 24)));
  const daysToSellOut = projectedDaily > 0 ? Math.round((currentQty / projectedDaily) * 10) / 10 : null;
  return {
    applicable: true,
    percent,
    durationHours,
    currentQty,
    unitPrice,
    adjustedPrice,
    dailyUnits: Math.round(dailyUnits * 10) / 10,
    projectedDailyUnits: Math.round(projectedDaily * 10) / 10,
    projectedUpliftPct: Math.round(projUplift),
    daysToSellOut,
    unitsInWindow,
    revenueInWindow: unitsInWindow * adjustedPrice,
    discountCost: Math.round(unitsInWindow * unitPrice * (percent / 100)),
  };
}

/** 활성 점포 전체에 대해 신호 탐지·처방 생성 (잡에서 호출). */
export async function generateForAllStores(): Promise<{ stores: number; actions: number }> {
  const pool = getPool();
  const [stores] = await pool.query<any[]>(`SELECT id FROM store WHERE status = 'active'`);
  let total = 0;
  for (const s of stores) {
    try {
      const r = await generateForStore(Number(s.id));
      total += r.actions;
    } catch (err: any) {
      logger.error({ err: err.message, storeId: s.id }, 'generateForStore failed');
    }
  }
  return { stores: stores.length, actions: total };
}
