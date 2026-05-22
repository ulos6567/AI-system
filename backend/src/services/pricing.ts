/**
 * T050 — 가격 룰 엔진 (FR-007/008/009, FR-021)
 *
 *   트리거 타입:
 *     - shelf_life  : 유통기한 임박 (재고 expires_at - 오늘 ≤ threshold_days)
 *     - weather     : 최근 weather 신호의 rain_mm/temp_c 조건
 *     - demand_drop : 최근 N일 매출이 직전 N일 대비 X% 이상 감소
 *     - schedule    : 시작 시각 도달 (날짜/시간/요일 매칭)
 *     - manual      : evaluate 에서 건너뜀 (수동 applyRule 로만 동작)
 *
 *   액션 타입:
 *     - percent_off  : { percent: 20 } → adjusted = original * (1 - 0.20)
 *     - fixed_price  : { price: 1500 } → adjusted = 1500
 *     - bundle       : { withProductMasterId, percent } → 동일 효과 + 표시만 다름
 *
 *   결과:
 *     - pricing_event 적재(audit_meta_json 에 트리거 입력값·룰 ID 보존)
 *     - ESL 어댑터 enqueue
 *     - 푸시 어댑터 send (대상 사용자: 점주 + 알림 동의 PII 사용자)
 *     - event_log 에 pricing.applied 적재 (디스패처가 SSE/notification 자동)
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';
import { getEslAdapter, getPushAdapter } from '../adapters/factory';

interface PricingRuleRow {
  id: number;
  store_id: number | null;
  name: string;
  trigger_type: 'shelf_life' | 'weather' | 'demand_drop' | 'schedule' | 'manual';
  trigger_config_json: any;
  action_type: 'percent_off' | 'fixed_price' | 'bundle';
  action_config_json: any;
  is_active: number | boolean;
}

interface ApplicationTarget {
  productMasterId: number;
  productName: string;
  originalPrice: number;
  shelfLocation?: string | null;
  reasonContext: Record<string, unknown>;
}

interface AppliedEvent {
  pricingEventId: number;
  productMasterId: number;
  productName: string;
  originalPrice: number;
  adjustedPrice: number;
  effectiveFrom: Date;
  effectiveTo: Date;
  eslStatus: 'pending' | 'sent' | 'failed';
}

function parseJsonField(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function lastUnitPriceFor(storeId: number, productMasterId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT ti.unit_price
       FROM transaction_item ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
      WHERE t.store_id = ? AND ti.product_master_id = ?
      ORDER BY t.occurred_at DESC LIMIT 1`,
    [storeId, productMasterId],
  );
  if (rows.length > 0) return Number(rows[0].unit_price);
  return 0;
}

async function fetchTargetsShelfLife(
  storeId: number,
  cfg: any,
): Promise<ApplicationTarget[]> {
  const days = Number(cfg?.threshold_days ?? 1);
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT i.product_master_id AS productMasterId, pm.name AS productName,
            i.shelf_location AS shelfLocation, i.expires_at AS expiresAt,
            DATEDIFF(i.expires_at, CURRENT_DATE) AS daysToExpiry,
            i.quantity AS quantity
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
      WHERE i.store_id = ?
        AND i.expires_at IS NOT NULL
        AND i.expires_at <= DATE_ADD(CURRENT_DATE, INTERVAL ? DAY)
        AND i.quantity > 0`,
    [storeId, days],
  );
  const out: ApplicationTarget[] = [];
  for (const r of rows) {
    const price = await lastUnitPriceFor(storeId, r.productMasterId);
    if (price <= 0) continue;
    out.push({
      productMasterId: r.productMasterId,
      productName: r.productName,
      originalPrice: price,
      shelfLocation: r.shelfLocation,
      reasonContext: { trigger: 'shelf_life', expiresAt: r.expiresAt, daysToExpiry: r.daysToExpiry, quantity: r.quantity, threshold_days: days },
    });
  }
  return out;
}

async function weatherMatches(storeId: number, cfg: any): Promise<{ matched: boolean; ctx: any }> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT payload_json, occurred_at FROM external_signal
      WHERE signal_type = 'weather'
        AND (store_id = ? OR store_id IS NULL)
        AND occurred_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
      ORDER BY occurred_at DESC LIMIT 1`,
    [storeId],
  );
  if (rows.length === 0) return { matched: false, ctx: { reason: 'no_recent_weather_signal' } };
  const payload = parseJsonField(rows[0].payload_json) ?? {};
  const minRain = Number(cfg?.min_rain_mm ?? -Infinity);
  const minTemp = Number(cfg?.min_temp_c ?? -Infinity);
  const maxTemp = Number(cfg?.max_temp_c ?? Infinity);
  const rain = Number(payload?.rain_mm ?? 0);
  const temp = Number(payload?.temp_c ?? 0);
  const ok = rain >= minRain && temp >= minTemp && temp <= maxTemp;
  return { matched: ok, ctx: { weather: payload, cfg } };
}

async function demandDropMatches(storeId: number, cfg: any): Promise<{ matched: boolean; ctx: any }> {
  const windowDays = Math.max(1, Number(cfg?.window_days ?? 7));
  const minDropPct = Number(cfg?.min_drop_pct ?? 30);
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT
        SUM(CASE WHEN t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN t.total_amount ELSE 0 END) AS recent,
        SUM(CASE WHEN t.occurred_at <  DATE_SUB(NOW(), INTERVAL ? DAY) AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN t.total_amount ELSE 0 END) AS prior
       FROM \`transaction\` t
      WHERE t.store_id = ? AND t.occurred_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [windowDays, windowDays, windowDays * 2, storeId, windowDays * 2],
  );
  const recent = Number(rows[0]?.recent ?? 0);
  const prior = Number(rows[0]?.prior ?? 0);
  if (prior <= 0) return { matched: false, ctx: { reason: 'insufficient_history' } };
  const dropPct = ((prior - recent) / prior) * 100;
  return { matched: dropPct >= minDropPct, ctx: { recent, prior, dropPct: Math.round(dropPct * 10) / 10, threshold_pct: minDropPct } };
}

function scheduleMatches(cfg: any): { matched: boolean; ctx: any } {
  const now = new Date();
  const dows: string[] | undefined = cfg?.days_of_week;
  if (Array.isArray(dows)) {
    const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
    if (!dows.includes(dow)) return { matched: false, ctx: { reason: 'dow_mismatch', dow } };
  }
  const startHour = Number(cfg?.start_hour ?? 0);
  const endHour = Number(cfg?.end_hour ?? 24);
  const ok = now.getHours() >= startHour && now.getHours() < endHour;
  return { matched: ok, ctx: { hour: now.getHours(), start_hour: startHour, end_hour: endHour } };
}

function applyAction(action: PricingRuleRow['action_type'], cfg: any, originalPrice: number): number {
  switch (action) {
    case 'percent_off':
      return Math.max(0, Math.round(originalPrice * (1 - Number(cfg?.percent ?? 0) / 100)));
    case 'fixed_price':
      return Math.max(0, Number(cfg?.price ?? originalPrice));
    case 'bundle':
      return Math.max(0, Math.round(originalPrice * (1 - Number(cfg?.percent ?? 10) / 100)));
    default:
      return originalPrice;
  }
}

function makeWindow(cfg: any): { from: Date; to: Date } {
  const from = new Date();
  const hours = Number(cfg?.duration_hours ?? 4);
  const to = new Date(from.getTime() + hours * 3600_000);
  return { from, to };
}

async function applyToTargets(
  storeId: number,
  rule: PricingRuleRow,
  targets: ApplicationTarget[],
): Promise<AppliedEvent[]> {
  if (targets.length === 0) return [];
  const pool = getPool();
  const esl = getEslAdapter();
  const push = getPushAdapter();
  const actionCfg = parseJsonField(rule.action_config_json) ?? {};
  const { from, to } = makeWindow(actionCfg);

  const results: AppliedEvent[] = [];
  for (const t of targets) {
    const adjusted = applyAction(rule.action_type, actionCfg, t.originalPrice);
    if (adjusted >= t.originalPrice) continue;

    const meta = {
      ruleId: rule.id,
      ruleName: rule.name,
      triggerType: rule.trigger_type,
      triggerContext: t.reasonContext,
      actionType: rule.action_type,
      actionConfig: actionCfg,
    };
    const [insRes]: any = await pool.query(
      `INSERT INTO pricing_event
         (store_id, product_master_id, pricing_rule_id, original_price, adjusted_price,
          effective_from, effective_to, esl_push_status, audit_meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [storeId, t.productMasterId, rule.id, t.originalPrice, adjusted, from, to, JSON.stringify(meta)],
    );
    const pricingEventId = insRes.insertId as number;

    let eslStatus: 'pending' | 'sent' | 'failed' = 'pending';
    try {
      const r = await esl.enqueue({
        storeId,
        productMasterId: t.productMasterId,
        shelfLocation: t.shelfLocation ?? undefined,
        originalPrice: t.originalPrice,
        adjustedPrice: adjusted,
        effectiveFrom: from,
        effectiveTo: to,
      });
      eslStatus = r.status;
    } catch (err: any) {
      eslStatus = 'failed';
      logger.error({ err: err.message, pricingEventId }, 'esl enqueue failed');
    }
    await pool.query(`UPDATE pricing_event SET esl_push_status = ? WHERE id = ?`, [eslStatus, pricingEventId]);

    // 점주들에게 단발 푸시 (mock)
    try {
      const [userRows] = await pool.query<any[]>(
        `SELECT user_id FROM store_user WHERE store_id = ? AND store_role IN ('STORE_OWNER','STORE_STAFF')`,
        [storeId],
      );
      for (const u of userRows) {
        await push.send({
          userId: u.user_id,
          storeId,
          title: `${t.productName} 할인 적용`,
          body: `${t.originalPrice}원 → ${adjusted}원 (${rule.name})`,
          data: { pricingEventId: String(pricingEventId), productMasterId: String(t.productMasterId) },
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'push send failed (non-fatal)');
    }

    await audit({
      storeId,
      eventType: 'pricing.applied',
      severity: 'info',
      message: `${t.productName}: ${t.originalPrice} → ${adjusted} (rule=${rule.name})`,
      metadata: { ...meta, pricingEventId, adjustedPrice: adjusted, originalPrice: t.originalPrice, eslStatus },
    });

    results.push({
      pricingEventId,
      productMasterId: t.productMasterId,
      productName: t.productName,
      originalPrice: t.originalPrice,
      adjustedPrice: adjusted,
      effectiveFrom: from,
      effectiveTo: to,
      eslStatus,
    });
  }
  return results;
}

export async function evaluateRule(ruleId: number, opts: { storeIdOverride?: number } = {}): Promise<AppliedEvent[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(`SELECT * FROM pricing_rule WHERE id = ?`, [ruleId]);
  if (rows.length === 0) throw new Error('rule_not_found');
  const rule = rows[0] as PricingRuleRow;
  if (!rule.is_active) return [];
  if (rule.trigger_type === 'manual') return [];

  const targetStores: number[] = [];
  if (rule.store_id) {
    targetStores.push(rule.store_id);
  } else if (opts.storeIdOverride) {
    targetStores.push(opts.storeIdOverride);
  } else {
    const [stores] = await pool.query<any[]>(`SELECT id FROM store WHERE status = 'active'`);
    targetStores.push(...stores.map((s: any) => Number(s.id)));
  }

  const triggerCfg = parseJsonField(rule.trigger_config_json) ?? {};
  const all: AppliedEvent[] = [];

  for (const storeId of targetStores) {
    let targets: ApplicationTarget[] = [];
    if (rule.trigger_type === 'shelf_life') {
      targets = await fetchTargetsShelfLife(storeId, triggerCfg);
    } else if (rule.trigger_type === 'weather') {
      const m = await weatherMatches(storeId, triggerCfg);
      if (!m.matched) continue;
      const productIds: number[] = Array.isArray(triggerCfg?.product_master_ids) ? triggerCfg.product_master_ids : [];
      for (const pid of productIds) {
        const price = await lastUnitPriceFor(storeId, pid);
        if (price <= 0) continue;
        const [pmRows] = await pool.query<any[]>(`SELECT name FROM product_master WHERE id = ?`, [pid]);
        targets.push({
          productMasterId: pid,
          productName: pmRows[0]?.name ?? `#${pid}`,
          originalPrice: price,
          reasonContext: { trigger: 'weather', ...m.ctx },
        });
      }
    } else if (rule.trigger_type === 'demand_drop') {
      const m = await demandDropMatches(storeId, triggerCfg);
      if (!m.matched) continue;
      const productIds: number[] = Array.isArray(triggerCfg?.product_master_ids) ? triggerCfg.product_master_ids : [];
      for (const pid of productIds) {
        const price = await lastUnitPriceFor(storeId, pid);
        if (price <= 0) continue;
        const [pmRows] = await pool.query<any[]>(`SELECT name FROM product_master WHERE id = ?`, [pid]);
        targets.push({
          productMasterId: pid,
          productName: pmRows[0]?.name ?? `#${pid}`,
          originalPrice: price,
          reasonContext: { trigger: 'demand_drop', ...m.ctx },
        });
      }
    } else if (rule.trigger_type === 'schedule') {
      const m = scheduleMatches(triggerCfg);
      if (!m.matched) continue;
      const productIds: number[] = Array.isArray(triggerCfg?.product_master_ids) ? triggerCfg.product_master_ids : [];
      for (const pid of productIds) {
        const price = await lastUnitPriceFor(storeId, pid);
        if (price <= 0) continue;
        const [pmRows] = await pool.query<any[]>(`SELECT name FROM product_master WHERE id = ?`, [pid]);
        targets.push({
          productMasterId: pid,
          productName: pmRows[0]?.name ?? `#${pid}`,
          originalPrice: price,
          reasonContext: { trigger: 'schedule', ...m.ctx },
        });
      }
    }

    const applied = await applyToTargets(storeId, rule, targets);
    all.push(...applied);
  }
  return all;
}

export async function evaluateAllActive(opts: { storeIdOverride?: number } = {}): Promise<{ evaluated: number; applied: AppliedEvent[] }> {
  const pool = getPool();
  const [rules] = await pool.query<any[]>(
    `SELECT id FROM pricing_rule WHERE is_active = TRUE AND trigger_type <> 'manual'`,
  );
  const all: AppliedEvent[] = [];
  for (const r of rules) {
    try {
      const applied = await evaluateRule(r.id, opts);
      all.push(...applied);
    } catch (err: any) {
      logger.error({ err: err.message, ruleId: r.id }, 'evaluate rule failed');
    }
  }
  return { evaluated: rules.length, applied: all };
}

export async function listPricingEvents(storeId: number, limit = 100): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT pe.id, pe.product_master_id AS productMasterId, pm.name AS productName,
            pm.category, pe.pricing_rule_id AS pricingRuleId,
            pr.name AS ruleName, pr.trigger_type AS triggerType, pr.action_type AS actionType,
            pe.original_price AS originalPrice, pe.adjusted_price AS adjustedPrice,
            pe.effective_from AS effectiveFrom, pe.effective_to AS effectiveTo,
            pe.esl_push_status AS eslPushStatus, pe.audit_meta_json AS auditMeta,
            pe.created_at AS createdAt
       FROM pricing_event pe
       JOIN product_master pm ON pm.id = pe.product_master_id
       JOIN pricing_rule pr ON pr.id = pe.pricing_rule_id
      WHERE pe.store_id = ?
      ORDER BY pe.created_at DESC
      LIMIT ?`,
    [storeId, limit],
  );
  return rows;
}
