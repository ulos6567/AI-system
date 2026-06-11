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
  promotion: {
    label: string;
    discountPct: number;
    categories: string[];
    window: string;
  } | null;
  inventoryTargets: InventoryTarget[];
}

/** 학사 이벤트 유형별 운영 플레이북 */
const PLAYBOOK: Record<
  string,
  { categories: string[]; upliftPct: number; promo: { label: string; discountPct: number } | null; headline: string }
> = {
  festival: {
    categories: ['beverage', 'snack', 'frozen', 'ricesnack'],
    upliftPct: 40,
    promo: { label: '축제 번들 할인', discountPct: 15 },
    headline: '축제 유동인구 급증 — 음료·스낵·아이스크림 재고 확대 및 번들 프로모션 권장',
  },
  exam: {
    categories: ['beverage', 'instant', 'lunchbox', 'snack'],
    upliftPct: 25,
    promo: { label: '심야 시험기간 할인', discountPct: 10 },
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

async function queryEvents(storeId: number): Promise<CampusEventRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT a.id, a.university_id AS universityId, u.name AS universityName,
            u.short_name AS universityShortName, su.distance_km AS distanceKm,
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
       JOIN store_university su ON su.university_id = a.university_id AND su.store_id = ?
      ORDER BY FIELD(status, 'active', 'upcoming', 'past'),
               (status = 'past') * -1, -- past 는 최근 종료 우선
               a.start_date ASC`,
    [storeId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    universityId: Number(r.universityId),
    universityName: r.universityName,
    universityShortName: r.universityShortName,
    distanceKm: num(r.distanceKm),
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
  const [unis] = await pool.query<any[]>(
    `SELECT u.id, u.name, u.short_name AS shortName, u.region,
            su.distance_km AS distanceKm, u.student_count AS studentCount
       FROM university u
       JOIN store_university su ON su.university_id = u.id AND su.store_id = ?
      ORDER BY su.distance_km ASC, u.name ASC`,
    [storeId],
  );
  const events = await queryEvents(storeId);
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
  return queryEvents(storeId);
}

async function inventoryTargetsFor(
  storeId: number,
  categories: string[],
  upliftPct: number,
): Promise<InventoryTarget[]> {
  if (categories.length === 0) return [];
  const pool = getPool();
  const placeholders = categories.map(() => '?').join(',');
  const [rows] = await pool.query<any[]>(
    `SELECT i.id AS inventoryId, i.product_master_id AS productMasterId,
            pm.name AS productName, pm.category, i.quantity AS currentQty
       FROM inventory i
       JOIN product_master pm ON pm.id = i.product_master_id
      WHERE i.store_id = ? AND pm.category IN (${placeholders})
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

/** 진행중·임박(7일 이내) 학사 일정에 대한 이벤트·재고 추천 생성 */
export async function buildRecommendations(storeId: number): Promise<CampusPlay[]> {
  const events = await queryEvents(storeId);
  const qualifying = events.filter(
    (e) =>
      PLAYBOOK[e.eventType] &&
      (e.status === 'active' || (e.status === 'upcoming' && e.daysUntilStart <= UPCOMING_HORIZON_DAYS)),
  );

  const plays: CampusPlay[] = [];
  for (const e of qualifying) {
    const pb = PLAYBOOK[e.eventType];
    const inventoryTargets = await inventoryTargetsFor(storeId, pb.categories, pb.upliftPct);
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
      headline: pb.headline,
      promotion: pb.promo
        ? {
            label: pb.promo.label,
            discountPct: pb.promo.discountPct,
            categories: pb.categories,
            window: e.peakHours ?? `${e.startDate} ~ ${e.endDate}`,
          }
        : null,
      inventoryTargets,
    });
  }
  return plays;
}
