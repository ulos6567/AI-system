/**
 * 002 (T036) — 행동 분석 서비스 (FR-011~013, SC-007/013)
 *
 *   - behavior_insight 집계: 실측 행동 이벤트(analytics_customer_behavior)가 있으면 그것을,
 *     없으면 Vision 시뮬레이션(존 그리드)을 사용해 존별 비식별 집계를 적재한다.
 *   - 히트맵(체류 가중치)·관심 행동(집음/내려놓음)·추정 세그먼트(비식별)를 제공한다.
 *   - 체류는 높은데 집음이 낮은 존 → 배치 개선 제안을 생성한다.
 *
 *   개인 식별 정보는 다루지 않는다 — 집계·분포값만 저장/반환(SC-013).
 */
import { getPool } from '../db/pool';
import { simulateZoneInsights, zoneGrid, type BehaviorInsightDraft } from '../adapters/vision/sim';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** 실측 이벤트 → 존별 집계 (없으면 시뮬레이션). behavior_insight 에 upsert. */
export async function rebuildBehaviorInsights(storeId: number, date = today()): Promise<number> {
  const pool = getPool();
  // 실측 존별 집계 (analytics_customer_behavior, 비식별)
  const [rows] = await pool.query<any[]>(
    `SELECT zone_code AS zoneCode,
            SUM(CASE WHEN event_type = 'dwell' THEN COALESCE(dwell_seconds, 0) ELSE 0 END) AS dwell,
            SUM(CASE WHEN event_type IN ('path','approach_shelf') THEN 1 ELSE 0 END) AS passes,
            SUM(CASE WHEN event_type = 'pickup' THEN 1 ELSE 0 END) AS pickups
       FROM analytics_customer_behavior
      WHERE store_id = ? AND zone_code IS NOT NULL
        AND occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY zone_code`,
    [storeId],
  );

  let drafts: BehaviorInsightDraft[];
  if (rows.length >= 3) {
    const labels = new Map(zoneGrid().map((z) => [z.code, z.label]));
    drafts = rows.map((r) => {
      const pickups = Number(r.pickups);
      return {
        zoneCode: r.zoneCode,
        zoneLabel: labels.get(r.zoneCode) ?? r.zoneCode,
        dwellWeight: Number(r.dwell),
        passCount: Number(r.passes),
        pickupCount: pickups,
        putbackCount: Math.round(pickups * 0.3),
        demoSegment: { ageBands: {}, gender: {} },
      };
    });
  } else {
    // 실측 데이터 부족 → 시뮬레이션으로 빈 화면 방지(데모)
    drafts = simulateZoneInsights(storeId);
  }

  // 멱등 적재: 같은 (store, date, zone) 은 교체
  await pool.query(`DELETE FROM behavior_insight WHERE store_id = ? AND insight_date = ?`, [storeId, date]);
  const values = drafts.map((d) => [
    storeId,
    date,
    d.zoneCode,
    d.dwellWeight,
    d.passCount,
    d.pickupCount,
    d.putbackCount,
    JSON.stringify(d.demoSegment),
  ]);
  if (values.length) {
    await pool.query(
      `INSERT INTO behavior_insight
         (store_id, insight_date, zone_code, dwell_weight, pass_count, pickup_count, putback_count, demo_segment_json)
       VALUES ?`,
      [values],
    );
  }
  return drafts.length;
}

async function ensureInsights(storeId: number, date: string): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c FROM behavior_insight WHERE store_id = ? AND insight_date = ?`,
    [storeId, date],
  );
  if (Number(rows[0]?.c ?? 0) === 0) await rebuildBehaviorInsights(storeId, date);
}

export interface HeatmapCell {
  zoneCode: string;
  zoneLabel: string;
  row: number;
  col: number;
  dwellWeight: number;
  intensity: number; // 0~1 정규화
  passCount: number;
  pickupCount: number;
}

/** 존 그리드 + 정규화된 체류 가중치(히트맵). */
export async function getHeatmap(storeId: number, date = today()): Promise<{ date: string; cells: HeatmapCell[] }> {
  await ensureInsights(storeId, date);
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT zone_code AS zoneCode, dwell_weight AS dwellWeight, pass_count AS passCount, pickup_count AS pickupCount
       FROM behavior_insight WHERE store_id = ? AND insight_date = ?`,
    [storeId, date],
  );
  const byZone = new Map(rows.map((r) => [r.zoneCode, r]));
  const maxDwell = Math.max(1, ...rows.map((r) => Number(r.dwellWeight)));
  const cells: HeatmapCell[] = zoneGrid().map((z) => {
    const r = byZone.get(z.code);
    const dwell = r ? Number(r.dwellWeight) : 0;
    return {
      zoneCode: z.code,
      zoneLabel: z.label,
      row: z.row,
      col: z.col,
      dwellWeight: dwell,
      intensity: Math.round((dwell / maxDwell) * 100) / 100,
      passCount: r ? Number(r.passCount) : 0,
      pickupCount: r ? Number(r.pickupCount) : 0,
    };
  });
  return { date, cells };
}

export interface BehaviorStats {
  zoneCode: string;
  zoneLabel: string;
  passCount: number;
  pickupCount: number;
  putbackCount: number;
  pickupRate: number; // pickup / pass
  conversionRate: number; // (pickup - putback) / pickup
  demoSegment: any;
}

export async function getBehaviorStats(storeId: number, date = today()): Promise<BehaviorStats[]> {
  await ensureInsights(storeId, date);
  const pool = getPool();
  const labels = new Map(zoneGrid().map((z) => [z.code, z.label]));
  const [rows] = await pool.query<any[]>(
    `SELECT zone_code AS zoneCode, pass_count AS passCount, pickup_count AS pickupCount,
            putback_count AS putbackCount, demo_segment_json AS demoSegment
       FROM behavior_insight WHERE store_id = ? AND insight_date = ?
       ORDER BY pickup_count DESC`,
    [storeId, date],
  );
  return rows.map((r) => {
    const pass = Number(r.passCount);
    const pickup = Number(r.pickupCount);
    const putback = Number(r.putbackCount);
    return {
      zoneCode: r.zoneCode,
      zoneLabel: labels.get(r.zoneCode) ?? r.zoneCode,
      passCount: pass,
      pickupCount: pickup,
      putbackCount: putback,
      pickupRate: pass > 0 ? Math.round((pickup / pass) * 1000) / 1000 : 0,
      conversionRate: pickup > 0 ? Math.round(((pickup - putback) / pickup) * 1000) / 1000 : 0,
      demoSegment: parseJson(r.demoSegment),
    };
  });
}

export interface PlacementSuggestion {
  zoneCode: string;
  zoneLabel: string;
  type: 'low_conversion' | 'high_traffic_low_pickup' | 'hot_zone';
  message: string;
}

/** 배치 개선 제안: 체류·통과 대비 집음/전환이 낮은 존을 식별. */
export async function placementSuggestions(storeId: number, date = today()): Promise<PlacementSuggestion[]> {
  const stats = await getBehaviorStats(storeId, date);
  const heat = await getHeatmap(storeId, date);
  const intensity = new Map(heat.cells.map((c) => [c.zoneCode, c.intensity]));
  const out: PlacementSuggestion[] = [];
  for (const s of stats) {
    const heatVal = intensity.get(s.zoneCode) ?? 0;
    if (heatVal >= 0.6 && s.pickupRate < 0.2) {
      out.push({
        zoneCode: s.zoneCode,
        zoneLabel: s.zoneLabel,
        type: 'high_traffic_low_pickup',
        message: `${s.zoneLabel}(${s.zoneCode}) — 체류는 높지만 집음률이 낮습니다(${Math.round(s.pickupRate * 100)}%). 진열 위치·POP 보강을 권장합니다.`,
      });
    } else if (s.pickupCount > 0 && s.conversionRate < 0.5) {
      out.push({
        zoneCode: s.zoneCode,
        zoneLabel: s.zoneLabel,
        type: 'low_conversion',
        message: `${s.zoneLabel}(${s.zoneCode}) — 집었다가 내려놓는 비율이 높습니다. 가격·구성 점검을 권장합니다.`,
      });
    } else if (heatVal >= 0.8 && s.pickupRate >= 0.3) {
      out.push({
        zoneCode: s.zoneCode,
        zoneLabel: s.zoneLabel,
        type: 'hot_zone',
        message: `${s.zoneLabel}(${s.zoneCode}) — 핫존입니다. 고마진·신상품 배치에 유리합니다.`,
      });
    }
  }
  return out;
}
