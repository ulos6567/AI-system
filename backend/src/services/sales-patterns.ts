/**
 * 판매 패턴 분석 서비스 (매장 분석)
 *   - getPeakHeatmap   : 요일(DAYOFWEEK 1=일~7=토) × 시간대(0~23) 거래수·매출 히트맵 (최근 30일)
 *   - getBasketAnalysis: 장바구니 연관분석 — 함께 팔리는 상품쌍 + 지지도/신뢰도/향상도(lift)
 *
 *   기존 transaction / transaction_item / product_master 데이터만 사용한다(비식별 집계).
 */
import { getPool } from '../db/pool';

const WINDOW_DAYS = 30;

export interface HeatCell {
  dow: number; // 1=일 ~ 7=토 (MySQL DAYOFWEEK)
  hour: number; // 0~23
  tx: number;
  revenue: number;
}
export interface PeakHeatmap {
  windowDays: number;
  cells: HeatCell[];
  maxTx: number;
  peak: { dow: number; hour: number; tx: number } | null;
  dowTotals: { dow: number; tx: number }[];
  hourTotals: { hour: number; tx: number }[];
}

/** 요일×시간대 거래 히트맵 (최근 30일). */
export async function getPeakHeatmap(storeId: number): Promise<PeakHeatmap> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT DAYOFWEEK(occurred_at) AS dow, HOUR(occurred_at) AS hr,
            COUNT(*) AS tx, COALESCE(SUM(total_amount),0) AS revenue
       FROM \`transaction\`
      WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
      GROUP BY DAYOFWEEK(occurred_at), HOUR(occurred_at)`,
    [storeId, WINDOW_DAYS],
  );
  const cells: HeatCell[] = rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hr),
    tx: Number(r.tx),
    revenue: Number(r.revenue),
  }));
  let maxTx = 0;
  let peak: { dow: number; hour: number; tx: number } | null = null;
  const dowMap = new Map<number, number>();
  const hourMap = new Map<number, number>();
  for (const c of cells) {
    if (c.tx > maxTx) { maxTx = c.tx; peak = { dow: c.dow, hour: c.hour, tx: c.tx }; }
    dowMap.set(c.dow, (dowMap.get(c.dow) ?? 0) + c.tx);
    hourMap.set(c.hour, (hourMap.get(c.hour) ?? 0) + c.tx);
  }
  return {
    windowDays: WINDOW_DAYS,
    cells,
    maxTx,
    peak,
    dowTotals: [...dowMap.entries()].map(([dow, tx]) => ({ dow, tx })).sort((a, b) => a.dow - b.dow),
    hourTotals: [...hourMap.entries()].map(([hour, tx]) => ({ hour, tx })).sort((a, b) => a.hour - b.hour),
  };
}

export interface BasketPair {
  p1: number; p2: number;
  name1: string; name2: string;
  cat1: string; cat2: string;
  pairCount: number;
  supportPct: number; // 두 상품이 함께 담긴 거래 비율
  confidence1to2Pct: number; // p1 산 거래 중 p2도 산 비율
  confidence2to1Pct: number;
  lift: number; // 1보다 크면 우연 이상으로 함께 구매
}
export interface BasketAnalysis {
  windowDays: number;
  totalBaskets: number;
  avgBasketSize: number;
  multiItemPct: number; // 2개 이상 담은 거래 비율
  pairs: BasketPair[];
}

/** 장바구니 연관분석 — 함께 팔리는 상품쌍 TOP12 + 지지도/신뢰도/향상도. */
export async function getBasketAnalysis(storeId: number): Promise<BasketAnalysis> {
  const pool = getPool();
  const [tot] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total,
            COALESCE(AVG(items),0) AS avgSize,
            COALESCE(SUM(items > 1),0) AS multi
       FROM (
         SELECT t.id, COUNT(*) AS items
           FROM \`transaction\` t
           JOIN transaction_item ti ON ti.transaction_id = t.id
          WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
          GROUP BY t.id
       ) b`,
    [storeId, WINDOW_DAYS],
  );
  const totalBaskets = Number(tot[0]?.total ?? 0);
  const avgBasketSize = Math.round(Number(tot[0]?.avgSize ?? 0) * 100) / 100;
  const multiItemPct = totalBaskets > 0 ? Math.round((Number(tot[0]?.multi ?? 0) / totalBaskets) * 1000) / 10 : 0;

  // 상품별 '구매 거래 수'
  const [cntRows] = await pool.query<any[]>(
    `SELECT ti.product_master_id AS pid, COUNT(DISTINCT t.id) AS cnt
       FROM transaction_item ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
      WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
      GROUP BY ti.product_master_id`,
    [storeId, WINDOW_DAYS],
  );
  const cnt = new Map<number, number>();
  for (const r of cntRows) cnt.set(Number(r.pid), Number(r.cnt));

  // 함께 담긴 상품쌍 (a.pid < b.pid 로 중복 제거)
  const [pairRows] = await pool.query<any[]>(
    `SELECT a.product_master_id AS p1, b.product_master_id AS p2,
            pa.name AS n1, pb.name AS n2, pa.category AS c1, pb.category AS c2,
            COUNT(*) AS pairCount
       FROM transaction_item a
       JOIN transaction_item b ON b.transaction_id = a.transaction_id AND a.product_master_id < b.product_master_id
       JOIN \`transaction\` t ON t.id = a.transaction_id
       JOIN product_master pa ON pa.id = a.product_master_id
       JOIN product_master pb ON pb.id = b.product_master_id
      WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
      GROUP BY a.product_master_id, b.product_master_id, pa.name, pb.name, pa.category, pb.category
      ORDER BY pairCount DESC
      LIMIT 12`,
    [storeId, WINDOW_DAYS],
  );

  const pairs: BasketPair[] = pairRows.map((r) => {
    const p1 = Number(r.p1);
    const p2 = Number(r.p2);
    const pairCount = Number(r.pairCount);
    const c1 = cnt.get(p1) ?? pairCount;
    const c2 = cnt.get(p2) ?? pairCount;
    const support = totalBaskets > 0 ? pairCount / totalBaskets : 0;
    const lift = totalBaskets > 0 && c1 > 0 && c2 > 0 ? (pairCount * totalBaskets) / (c1 * c2) : 0;
    return {
      p1, p2,
      name1: r.n1, name2: r.n2, cat1: r.c1, cat2: r.c2,
      pairCount,
      supportPct: Math.round(support * 1000) / 10,
      confidence1to2Pct: c1 > 0 ? Math.round((pairCount / c1) * 1000) / 10 : 0,
      confidence2to1Pct: c2 > 0 ? Math.round((pairCount / c2) * 1000) / 10 : 0,
      lift: Math.round(lift * 100) / 100,
    };
  });

  return { windowDays: WINDOW_DAYS, totalBaskets, avgBasketSize, multiItemPct, pairs };
}
