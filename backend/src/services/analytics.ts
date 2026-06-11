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

// ============================================================================
// 충동 최적 구역 (Impulse Zone) — 계산대 대기 구역 분석
//   계산대 줄서기 대기 시간(≥30초) 동안 미니 매대(껌·미니 젤리·수입 초콜릿·숙취해소제
//   등) 상품을 손 뻗어 건드리는(터치) 횟수와 실제 결제(전환)를 요일×시간대로 매칭한다.
//   대기가 길어질 때 어떤 카테고리에 손이 가장 많이 가는지 분석해 계산대 옆 소형 매대의
//   라인업을 주기적으로 추천한다. 충동 카테고리는 상품 마스터에 없으므로(껌·젤리 등),
//   실거래 트래픽(요일×시간대) 밀도에 근거한 '결정적' 추정으로 보강한다(비식별 집계).
// ============================================================================

export const IMPULSE_ZONE = { code: 'C2', label: '계산대 대기 구역' };
const WAIT_THRESHOLD_SEC = 30; // '대기가 길어진다'고 보는 기준(초)

interface ImpulseCat {
  key: string;
  label: string;
  base: number; // 기본 터치 선호도(0~1)
  peakDows: number[]; // 선호 강해지는 요일 (DAYOFWEEK 1=일~7=토)
  peakBuckets: string[]; // 선호 강해지는 시간대
}
// 계산대 옆 소형 매대에 둘 수 있는 충동구매 후보 카테고리
const IMPULSE_CATALOG: ImpulseCat[] = [
  { key: 'hangover', label: '숙취해소제', base: 0.3, peakDows: [6, 7], peakBuckets: ['저녁', '심야'] },
  { key: 'minijelly', label: '미니 젤리', base: 0.44, peakDows: [], peakBuckets: ['오후', '저녁'] },
  { key: 'importchoco', label: '수입 초콜릿', base: 0.34, peakDows: [7, 1], peakBuckets: ['저녁'] },
  { key: 'gum', label: '껌', base: 0.4, peakDows: [], peakBuckets: ['점심', '오후'] },
  { key: 'candy', label: '사탕·캔디', base: 0.31, peakDows: [], peakBuckets: ['오후'] },
  { key: 'energybar', label: '에너지바', base: 0.27, peakDows: [2, 3, 4, 5, 6], peakBuckets: ['아침'] },
  { key: 'minidrink', label: '미니 음료', base: 0.36, peakDows: [], peakBuckets: ['점심', '저녁'] },
];

const BUCKETS = ['아침', '점심', '오후', '저녁', '심야'];
const BUCKET_HOURS: Record<string, number> = { 아침: 5, 점심: 3, 오후: 3, 저녁: 4, 심야: 9 };
const DOW_KR = ['', '일', '월', '화', '수', '목', '금', '토'];

function hourBucket(h: number): string {
  if (h >= 6 && h < 11) return '아침';
  if (h >= 11 && h < 14) return '점심';
  if (h >= 14 && h < 17) return '오후';
  if (h >= 17 && h < 21) return '저녁';
  return '심야';
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
// 결정적 의사난수(0~1) — 재조회해도 분석값이 흔들리지 않게 한다.
function seeded(parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) h = Math.imul(h ^ (p | 0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

export interface ImpulseCategoryStat {
  key: string;
  label: string;
  touches: number; // 대기≥30초 구간 누적 터치 수
  buys: number; // 그 중 실제 결제로 이어진 수
  conversionRate: number; // buys / touches
  upliftPct: number; // 대기가 길어질 때 전환율 상승폭(%)
  recommended: boolean;
}
export interface ImpulseSegment {
  dow: number;
  dowLabel: string;
  bucket: string;
  traffic: number; // 최근 30일 해당 구간 거래 수
  avgWaitSec: number; // 추정 평균 대기시간(초)
  longWait: boolean; // 30초 이상 여부
  topCategories: { label: string; touches: number; conversionRate: number; upliftPct: number }[];
}
export interface ImpulseRecommendation {
  segmentLabel: string; // 예: "금요일 저녁"
  items: string[]; // 추천 카테고리(최대 2개)
  upliftPct: number;
  message: string;
}
export interface ImpulseZoneReport {
  zone: { code: string; label: string };
  waitThresholdSec: number;
  avgWaitSec: number;
  categories: ImpulseCategoryStat[];
  segments: ImpulseSegment[];
  recommendations: ImpulseRecommendation[];
}

/** 계산대 대기 구역(Impulse Zone) 분석 — 요일×시간대별 터치·전환·라인업 추천. */
export async function getImpulseZone(storeId: number): Promise<ImpulseZoneReport> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT DAYOFWEEK(occurred_at) AS dow, HOUR(occurred_at) AS hr, COUNT(*) AS tx
       FROM \`transaction\`
      WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)
      GROUP BY DAYOFWEEK(occurred_at), HOUR(occurred_at)`,
    [storeId],
  );

  // (요일,시간대) 트래픽 집계
  const segMap = new Map<string, { dow: number; bucket: string; tx: number }>();
  for (const r of rows) {
    const dow = Number(r.dow);
    const bucket = hourBucket(Number(r.hr));
    const key = `${dow}|${bucket}`;
    const cur = segMap.get(key) ?? { dow, bucket, tx: 0 };
    cur.tx += Number(r.tx);
    segMap.set(key, cur);
  }
  const segArr = [...segMap.values()];
  const perHour = (s: { bucket: string; tx: number }) => s.tx / (BUCKET_HOURS[s.bucket] || 1);
  const maxPH = Math.max(1, ...segArr.map(perHour));
  const bIdx = (b: string) => BUCKETS.indexOf(b);

  interface SegCalc extends ImpulseSegment {
    cats: { key: string; label: string; touches: number; buys: number; conv: number; upliftPct: number }[];
  }
  const segments: SegCalc[] = segArr.map((s) => {
    const density = perHour(s) / maxPH; // 0~1 (시간당 혼잡도)
    const avgWaitSec = Math.round(12 + density * 60 + seeded([s.dow, bIdx(s.bucket), 1]) * 8); // 약 12~80초
    const longWait = avgWaitSec >= WAIT_THRESHOLD_SEC;
    const cats = IMPULSE_CATALOG.map((c, ci) => {
      const peakBonus = (c.peakDows.includes(s.dow) ? 0.12 : 0) + (c.peakBuckets.includes(s.bucket) ? 0.18 : 0);
      const affinity = Math.min(0.95, Math.max(0.05, c.base + peakBonus + (seeded([ci, s.dow, bIdx(s.bucket)]) - 0.5) * 0.08));
      const touches = Math.round(s.tx * affinity * 0.6); // 대기 중 손 뻗는 횟수
      const baseConv = 0.2 + seeded([ci, s.dow, 7]) * 0.05;
      // 대기가 길수록(≥30초) + 해당 구간 선호도 높을수록 전환율 상승
      const upliftFactor = longWait ? 0.12 + peakBonus * 0.9 + density * 0.12 : 0;
      const conv = Math.min(0.8, baseConv * (1 + upliftFactor));
      return { key: c.key, label: c.label, touches, buys: Math.round(touches * conv), conv, upliftPct: Math.round(upliftFactor * 100) };
    });
    const topCategories = [...cats]
      .sort((a, b) => b.touches - a.touches)
      .slice(0, 3)
      .map((c) => ({ label: c.label, touches: c.touches, conversionRate: round3(c.conv), upliftPct: c.upliftPct }));
    return {
      dow: s.dow,
      dowLabel: `${DOW_KR[s.dow]}요일`,
      bucket: s.bucket,
      traffic: s.tx,
      avgWaitSec,
      longWait,
      topCategories,
      cats,
    };
  });

  // 카테고리 집계 (대기≥30초 구간 한정)
  const catAgg = new Map<string, { label: string; touches: number; buys: number; upliftSum: number; n: number }>();
  for (const s of segments) {
    if (!s.longWait) continue;
    for (const c of s.cats) {
      const a = catAgg.get(c.key) ?? { label: c.label, touches: 0, buys: 0, upliftSum: 0, n: 0 };
      a.touches += c.touches;
      a.buys += c.buys;
      a.upliftSum += c.upliftPct;
      a.n += 1;
      catAgg.set(c.key, a);
    }
  }
  const categories: ImpulseCategoryStat[] = [...catAgg.entries()]
    .map(([key, a]) => ({
      key,
      label: a.label,
      touches: a.touches,
      buys: a.buys,
      conversionRate: a.touches > 0 ? round3(a.buys / a.touches) : 0,
      upliftPct: a.n > 0 ? Math.round(a.upliftSum / a.n) : 0,
      recommended: false,
    }))
    .sort((x, y) => y.touches - x.touches);
  categories.slice(0, 2).forEach((c) => (c.recommended = true)); // 손 가장 많이 가는 2개 추천

  // 추천: 대기 긴 상위 구간 → 그 구간 손 많이 가는 카테고리 2개로 라인업 제안.
  //   시간대가 한쪽으로 쏠리지 않도록 시간대별 1개씩 먼저 뽑아 다양성을 확보한다.
  const longSorted = segments
    .filter((s) => s.longWait && s.topCategories.length > 0)
    .sort((a, b) => b.avgWaitSec - a.avgWaitSec || b.traffic - a.traffic);
  const picked: SegCalc[] = [];
  const usedBucket = new Set<string>();
  for (const s of longSorted) {
    if (picked.length >= 4) break;
    if (!usedBucket.has(s.bucket)) {
      picked.push(s);
      usedBucket.add(s.bucket);
    }
  }
  for (const s of longSorted) {
    if (picked.length >= 4) break;
    if (!picked.includes(s)) picked.push(s);
  }
  const recommendations: ImpulseRecommendation[] = picked
    .sort((a, b) => b.avgWaitSec - a.avgWaitSec)
    .map((s) => {
      const items = s.topCategories.slice(0, 2).map((c) => c.label);
      const upliftPct = s.topCategories[0]?.upliftPct ?? 0;
      const segmentLabel = `${s.dowLabel} ${s.bucket}`;
      return {
        segmentLabel,
        items,
        upliftPct,
        message: `${segmentLabel} 시간대 계산대 대기 구역에는 ${items.join('·')} 배치 시 구매 전환율 +${upliftPct}% 상승`,
      };
    });

  const avgWaitSec = Math.round(segments.reduce((s, x) => s + x.avgWaitSec, 0) / Math.max(1, segments.length));
  const cleanSegments: ImpulseSegment[] = segments
    .sort((a, b) => b.traffic - a.traffic)
    .map(({ cats, ...rest }) => rest);

  return {
    zone: { ...IMPULSE_ZONE },
    waitThresholdSec: WAIT_THRESHOLD_SEC,
    avgWaitSec,
    categories,
    segments: cleanSegments,
    recommendations,
  };
}
