/**
 * 캠퍼스 캘린더 서비스
 *   - 점포 인근 대학의 학사일정(축제/시험기간/방학)과 통금 시간을 조회하고,
 *   - 진행중·임박 일정에 대해 이벤트(프로모션)·재고 조정 추천을 생성한다.
 *
 * 추천 로직(플레이북)은 학사 이벤트 유형별로 수요가 몰리는 카테고리와
 * 재고 증감률을 정의한다. 실제 점포 재고(inventory)에 매핑하여 권장 수량을 산출한다.
 */
import { getPool } from '../db/pool';

export type EventType = 'festival' | 'exam' | 'vacation' | 'entrance' | 'orientation';
export type EventStatus = 'active' | 'upcoming' | 'past';

export interface CampusEventRow {
  id: number;
  universityId: number;
  universityName: string;
  universityShortName: string | null;
  distanceKm: number | null;
  studentCount: number | null;
  eventType: EventType;
  title: string;
  startDate: string;
  endDate: string;
  curfewTime: string | null;
  peakHours: string | null;
  trafficLevel: 'low' | 'normal' | 'high' | 'peak';
  note: string | null;
  status: EventStatus;
  daysUntilStart: number;
  daysUntilEnd: number;
}

export interface UniversitySummary {
  id: number;
  name: string;
  shortName: string | null;
  region: string | null;
  address: string | null;
  distanceKm: number | null;
  studentCount: number | null;
  activeFestival: boolean;
  activeExam: boolean;
  onVacation: boolean;
  /** 현재 가장 영향이 큰 상태 라벨 (화면 배지용) */
  statusLabel: '축제 진행중' | '시험기간' | '방학' | '평시';
  events: CampusEventRow[];
}

export interface InventoryTarget {
  inventoryId: number;
  productMasterId: number;
  productName: string;
  category: string;
  currentQty: number;
  suggestedQty: number;
  deltaQty: number;
}

export interface CampusPlay {
  eventId: number;
  universityName: string;
  universityShortName: string | null;
  eventType: EventType;
  title: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  daysUntilStart: number;
  curfewTime: string | null;
  peakHours: string | null;
  trafficLevel: string;
  headline: string;
  /**
   * 이벤트(프로모션) 추진안 — 단순 할인율이 아니라 '실행 가능한' 상세 기획.
   *   mechanic(할인 방식) · bundles(추천 묶음 구성) · targetItems(핵심 타깃) ·
   *   channels(노출 채널) · expectedUpliftPct(기대 매출 상승) · tip(운영 팁) 포함.
   */
  promotion: {
    label: string;
    discountPct: number;
    categories: string[];
    window: string;
    period: string;
    mechanic: string;
    bundles: string[];
    targetItems: string[];
    channels: string[];
    expectedUpliftPct: number;
    tip: string;
    discountNote: string | null;
  } | null;
  inventoryTargets: InventoryTarget[];
}

/** 이벤트 추진안(프로모션) 기획 템플릿 */
interface PromoPlan {
  label: string;
  discountPct: number;
  mechanic: string;
  bundles: string[];
  targetItems: string[];
  channels: string[];
  expectedUpliftPct: number;
  tip: string;
}

/** 학사 이벤트 유형별 운영 플레이북 */
const PLAYBOOK: Record<
  string,
  { categories: string[]; upliftPct: number; promo: PromoPlan | null; headline: string }
> = {
  festival: {
    categories: ['beverage', 'snack', 'frozen', 'ricesnack'],
    upliftPct: 40,
    promo: {
      label: '축제 번들 할인',
      discountPct: 15,
      mechanic: '음료 + 스낵/아이스크림 묶음 구매 시 15% 즉시 할인 (단품가 대비)',
      bundles: ['음료 1 + 스낵 1 묶음가', '아이스크림 2개 묶음', '핫바 + 음료 세트'],
      targetItems: ['생수·탄산·이온음료', '스낵·과자', '아이스크림·핫바'],
      channels: ['POS 결제화면 배너', '매장 입구·축제 동선 POP', '에브리타임·대학 커뮤니티 SNS'],
      expectedUpliftPct: 18,
      tip: '저녁 피크에 음료·아이스크림 매대를 전면 배치하고, 계산대 옆에 충동구매 품목을 노출하세요.',
    },
    headline: '축제 유동인구 급증 — 음료·스낵·아이스크림 재고 확대 및 번들 프로모션 권장',
  },
  exam: {
    categories: ['beverage', 'instant', 'lunchbox', 'snack'],
    upliftPct: 25,
    promo: {
      label: '심야 시험기간 할인',
      discountPct: 10,
      mechanic: '23시~익일 02시 카페인 음료·간편식 10% 시간대 할인',
      bundles: ['컵라면 + 삼각김밥 세트', '에너지드링크 2캔 묶음', '캔커피 + 단백질바'],
      targetItems: ['카페인 음료·캔커피', '컵라면·간편식', '도시락·삼각김밥'],
      channels: ['심야 시간대 POS 자동 할인', '도서관·기숙사 인근 전단', '카카오 채널 푸시 알림'],
      expectedUpliftPct: 12,
      tip: '시험기간 통금 연장으로 심야 수요가 집중됩니다 — 카페인 음료·컵라면 결품에 특히 주의하세요.',
    },
    headline: '시험기간 심야 수요 — 카페인 음료·간편식·컵라면 재고 확대 및 심야 할인 권장',
  },
  vacation: {
    categories: ['lunchbox', 'ricesnack', 'frozen'],
    upliftPct: -30,
    promo: null,
    headline: '방학 유동 급감 — 신선·단기 유통식품 재고 축소로 폐기 손실 방지',
  },
};

/** 추천에 포함할 임박 일정 기준: 시작일이 N일 이내(또는 진행중) */
const UPCOMING_HORIZON_DAYS = 7;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** TIME(HH:MM:SS) → HH:MM (없으면 null) */
function trimTime(v: string | null): string | null {
  if (!v) return null;
  return v.length >= 5 ? v.slice(0, 5) : v;
}

/**
 * 학사 이벤트 조회.
 *   - scope='nearby': 점포 인근(store_university 연계) 대학만 — 추천 생성용
 *   - scope='all'   : 전국 모든 대학 — 화면 표시용(인근 대학은 거리값 동반)
 */
async function queryEvents(
  storeId: number,
  scope: 'nearby' | 'all' = 'nearby',
  universityIds?: number[],
): Promise<CampusEventRow[]> {
  const pool = getPool();
  // 특정 대학 목록(지역 필터)으로 조회할 때는 인근 연계가 아니어도 보여야 하므로 LEFT JOIN.
  const byIds = universityIds != null && universityIds.length > 0;
  const useLeft = scope === 'all' || byIds;
  const joinSu = useLeft
    ? 'LEFT JOIN store_university su ON su.university_id = a.university_id AND su.store_id = ?'
    : 'JOIN store_university su ON su.university_id = a.university_id AND su.store_id = ?';
  const where = byIds ? `WHERE a.university_id IN (${universityIds!.map(() => '?').join(',')})` : '';
  const params = byIds ? [storeId, ...universityIds!] : [storeId];
  const [rows] = await pool.query<any[]>(
    `SELECT a.id, a.university_id AS universityId, u.name AS universityName,
            u.short_name AS universityShortName, su.distance_km AS distanceKm,
            u.student_count AS studentCount,
            a.event_type AS eventType, a.title,
            a.start_date AS startDate, a.end_date AS endDate,
            a.curfew_time AS curfewTime, a.peak_hours AS peakHours,
            a.traffic_level AS trafficLevel, a.note,
            CASE WHEN CURRENT_DATE BETWEEN a.start_date AND a.end_date THEN 'active'
                 WHEN a.start_date > CURRENT_DATE THEN 'upcoming'
                 ELSE 'past' END AS status,
            DATEDIFF(a.start_date, CURRENT_DATE) AS daysUntilStart,
            DATEDIFF(a.end_date, CURRENT_DATE)   AS daysUntilEnd
       FROM academic_event a
       JOIN university u        ON u.id = a.university_id
       ${joinSu}
       ${where}
      ORDER BY FIELD(status, 'active', 'upcoming', 'past'),
               (status = 'past') * -1, -- past 는 최근 종료 우선
               a.start_date ASC`,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    universityId: Number(r.universityId),
    universityName: r.universityName,
    universityShortName: r.universityShortName,
    distanceKm: num(r.distanceKm),
    studentCount: num(r.studentCount),
    eventType: r.eventType,
    title: r.title,
    startDate: String(r.startDate).slice(0, 10),
    endDate: String(r.endDate).slice(0, 10),
    curfewTime: trimTime(r.curfewTime),
    peakHours: r.peakHours,
    trafficLevel: r.trafficLevel,
    note: r.note,
    status: r.status,
    daysUntilStart: Number(r.daysUntilStart),
    daysUntilEnd: Number(r.daysUntilEnd),
  }));
}

export async function listUniversities(storeId: number): Promise<UniversitySummary[]> {
  const pool = getPool();
  // 전국 모든 대학을 표시한다. 점포 인근(store_university 연계) 대학은 거리값을 동반하며 상단에 노출.
  const [unis] = await pool.query<any[]>(
    `SELECT u.id, u.name, u.short_name AS shortName, u.region, u.address,
            su.distance_km AS distanceKm, u.student_count AS studentCount
       FROM university u
       LEFT JOIN store_university su ON su.university_id = u.id AND su.store_id = ?
      ORDER BY (su.distance_km IS NULL), su.distance_km ASC, u.region ASC, u.name ASC`,
    [storeId],
  );
  const events = await queryEvents(storeId, 'all');
  return unis.map((u) => {
    const own = events.filter((e) => e.universityId === Number(u.id));
    const activeFestival = own.some((e) => e.status === 'active' && e.eventType === 'festival');
    const activeExam = own.some((e) => e.status === 'active' && e.eventType === 'exam');
    const onVacation = own.some((e) => e.status === 'active' && e.eventType === 'vacation');
    const statusLabel: UniversitySummary['statusLabel'] = activeFestival
      ? '축제 진행중'
      : activeExam
        ? '시험기간'
        : onVacation
          ? '방학'
          : '평시';
    return {
      id: Number(u.id),
      name: u.name,
      shortName: u.shortName,
      region: u.region,
      address: u.address ?? null,
      distanceKm: num(u.distanceKm),
      studentCount: num(u.studentCount),
      activeFestival,
      activeExam,
      onVacation,
      statusLabel,
      events: own,
    };
  });
}

export async function listCalendar(storeId: number): Promise<CampusEventRow[]> {
  return queryEvents(storeId, 'all');
}

async function inventoryTargetsFor(
  storeId: number,
  categories: string[],
  upliftPct: number,
): Promise<InventoryTarget[]> {
  if (categories.length === 0) return [];
  const pool = getPool();
  const placeholders = categories.map(() => '?').join(',');
  // 같은 상품이 여러 재고행(유통기한 배치 등)으로 존재할 수 있어 권장 재고표에 중복 노출될 수 있다.
  // (store, product) 당 대표 1행(가장 이른 id)만 선택해 품목별로 1줄씩만 추천한다.
  const [rows] = await pool.query<any[]>(
    `SELECT i.id AS inventoryId, i.product_master_id AS productMasterId,
            pm.name AS productName, pm.category, i.quantity AS currentQty
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
      WHERE i.store_id = ? AND pm.category IN (${placeholders})
        AND i.id = (SELECT MIN(i2.id) FROM inventory i2
                     WHERE i2.store_id = i.store_id AND i2.product_master_id = i.product_master_id)
      ORDER BY pm.category ASC, pm.name ASC`,
    [storeId, ...categories],
  );
  return rows.map((r) => {
    const currentQty = Number(r.currentQty);
    const suggestedQty = Math.max(0, Math.round(currentQty * (1 + upliftPct / 100)));
    return {
      inventoryId: Number(r.inventoryId),
      productMasterId: Number(r.productMasterId),
      productName: r.productName,
      category: r.category,
      currentQty,
      suggestedQty,
      deltaQty: suggestedQty - currentQty,
    };
  });
}

/**
 * 대학별 '영향 가중치' — 같은 이벤트 유형이라도 점포에 미치는 수요 강도는 대학마다 다르다.
 *   유동수준(traffic) · 점포와의 거리 · 재학생 수 · 진행/임박 상태를 종합해 0.5~1.6 배율 산출.
 *   카테고리(품목)는 점포 재고가 동일하므로 유형 기준으로 두고, 추천 '강도'만 대학별로 차등한다.
 */
const TRAFFIC_W: Record<string, number> = { peak: 1.3, high: 1.0, normal: 0.7, low: 0.4 };
function impactFactor(e: CampusEventRow): { factor: number; drivers: string } {
  const tw = TRAFFIC_W[e.trafficLevel] ?? 0.7;
  const dw = e.distanceKm == null ? 1.0 : Math.max(0.4, Math.min(1.4, 1.4 - 0.12 * e.distanceKm));
  const sw = e.studentCount == null ? 1.0 : Math.max(0.5, Math.min(1.5, e.studentCount / 25000));
  const stw = e.status === 'active' ? 1.0 : 0.9;
  const score = 0.45 * tw + 0.3 * dw + 0.25 * sw;
  const factor = Math.round(Math.max(0.5, Math.min(1.6, score * stw)) * 100) / 100;
  const trafficKo =
    e.trafficLevel === 'peak' ? '유동 매우높음' : e.trafficLevel === 'high' ? '유동 높음' : e.trafficLevel === 'low' ? '유동 낮음' : '유동 보통';
  const parts = [trafficKo];
  if (e.distanceKm != null) parts.push(`${e.distanceKm}km`);
  if (e.studentCount != null) parts.push(`재학생 ${Math.round(e.studentCount / 1000)}천명`);
  return { factor, drivers: parts.join('·') };
}

/**
 * 진행중·임박(7일 이내) 학사 일정에 대한 이벤트·재고 추천 생성.
 *   - 기본: 점포 인근(store_university 연계) 대학 기준.
 *   - opts.universityIds 지정 시(지역 필터): 해당 대학들 기준으로 추천을 생성한다.
 *     (재고 권장량은 현재 점포 재고를 기준으로 산출 — '이 지역이면 이렇게' 시뮬레이션)
 */
export async function buildRecommendations(
  storeId: number,
  opts?: { universityIds?: number[] },
): Promise<CampusPlay[]> {
  const ids = opts?.universityIds?.filter((n) => Number.isInteger(n) && n > 0);
  const events = ids && ids.length ? await queryEvents(storeId, 'all', ids) : await queryEvents(storeId, 'nearby');
  const qualifying = events.filter(
    (e) =>
      PLAYBOOK[e.eventType] &&
      (e.status === 'active' || (e.status === 'upcoming' && e.daysUntilStart <= UPCOMING_HORIZON_DAYS)),
  );

  const plays: CampusPlay[] = [];
  for (const e of qualifying) {
    const pb = PLAYBOOK[e.eventType];
    const { factor, drivers } = impactFactor(e);
    // 대학별 영향 가중치로 권장 증감률을 차등(방학 등 음수는 부호 유지).
    const scaledUplift =
      pb.upliftPct >= 0 ? Math.max(5, Math.round(pb.upliftPct * factor)) : Math.round(pb.upliftPct * factor);
    const inventoryTargets = await inventoryTargetsFor(storeId, pb.categories, scaledUplift);
    // 할인폭도 유동수준에 따라 차등(±).
    const discountAdj = e.trafficLevel === 'peak' ? 5 : e.trafficLevel === 'high' ? 2 : e.trafficLevel === 'low' ? -2 : 0;
    plays.push({
      eventId: e.id,
      universityName: e.universityName,
      universityShortName: e.universityShortName,
      eventType: e.eventType,
      title: e.title,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      daysUntilStart: e.daysUntilStart,
      curfewTime: e.curfewTime,
      peakHours: e.peakHours,
      trafficLevel: e.trafficLevel,
      headline: `${pb.headline} · ${e.universityShortName ?? e.universityName} 수요 가중 ×${factor} (${drivers}) → 권장 ${scaledUplift > 0 ? '+' : ''}${scaledUplift}%`,
      promotion: pb.promo
        ? {
            label: pb.promo.label,
            discountPct: Math.max(5, Math.min(25, pb.promo.discountPct + discountAdj)),
            categories: pb.categories,
            window: e.peakHours ? `${e.peakHours} (피크 집중)` : `${e.startDate} ~ ${e.endDate}`,
            period: `${e.startDate} ~ ${e.endDate}`,
            mechanic: pb.promo.mechanic,
            bundles: pb.promo.bundles,
            targetItems: pb.promo.targetItems,
            channels: pb.promo.channels,
            // 기대 매출 상승도 대학별 수요 가중치를 반영해 차등.
            expectedUpliftPct: Math.round(pb.promo.expectedUpliftPct * factor),
            tip: pb.promo.tip,
            discountNote:
              discountAdj !== 0
                ? `유동수준(${e.trafficLevel})에 따라 기본 ${pb.promo.discountPct}% → ${discountAdj > 0 ? '+' : ''}${discountAdj}%p 조정`
                : null,
          }
        : null,
      inventoryTargets,
    });
  }
  return plays;
}
