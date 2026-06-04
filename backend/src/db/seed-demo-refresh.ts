/**
 * 데모 데이터 리프레시 — "현재 시점" 기준으로 현실적인 운영 데이터를 재생성한다.
 *
 *   - 최근 30일치 거래(요일·시간대 피크 반영) + 품목 + 재고 이력
 *   - 오늘 기준 신선한 재고(유통기한 임박/저재고/결품 섞음)
 *   - 다양한 상태의 발주(입고완료·송신·승인·검토대기·초안)
 *   - 내일자 수요예측
 *   - 최근 30일 KPI 일별 집계(매출 리포트용)
 *
 * 실행: npm run db:seed:demo   (package.json 스크립트)
 * 멱등성: 점포 1~3의 거래/재고/발주/예측/KPI 를 지우고 새로 만든다(데모 전용).
 */
import { getPool, closePool } from './pool';
import { forecastStoreFor } from '../services/forecast';
import { backfillRange } from '../services/kpi';
import { logger } from '../lib/logger';

const STORES = [1, 2, 3];
const DAYS = 30;

// 점포별 거래량 성향 (기본 일일 거래 수, 주말 가중)
const STORE_PROFILE: Record<number, { base: number; weekendBoost: number }> = {
  1: { base: 46, weekendBoost: 1.25 }, // 강남역 직영점 — 가장 붐빔
  2: { base: 30, weekendBoost: 0.7 }, // 판교 테크노밸리 — 평일 점심 집중
  3: { base: 38, weekendBoost: 1.35 }, // 홍대입구 — 주말/저녁 강세
};

// product_master_id → { 단가(KRW), 인기 가중치, 카테고리 }
const PRODUCTS: Record<number, { price: number; weight: number; cat: string; shelf: number }> = {
  1: { price: 950, weight: 9, cat: 'beverage', shelf: 365 },
  2: { price: 2000, weight: 8, cat: 'beverage', shelf: 180 },
  3: { price: 2000, weight: 7, cat: 'beverage', shelf: 180 },
  4: { price: 1500, weight: 9, cat: 'beverage', shelf: 30 },
  5: { price: 2500, weight: 6, cat: 'beverage', shelf: 30 },
  6: { price: 1700, weight: 7, cat: 'beverage', shelf: 14 },
  7: { price: 1700, weight: 5, cat: 'beverage', shelf: 14 },
  8: { price: 1500, weight: 6, cat: 'snack', shelf: 90 },
  9: { price: 1800, weight: 6, cat: 'snack', shelf: 120 },
  10: { price: 1200, weight: 5, cat: 'snack', shelf: 180 },
  11: { price: 4500, weight: 10, cat: 'lunchbox', shelf: 2 },
  12: { price: 4500, weight: 9, cat: 'lunchbox', shelf: 2 },
  13: { price: 3900, weight: 8, cat: 'lunchbox', shelf: 2 },
  14: { price: 1300, weight: 11, cat: 'ricesnack', shelf: 1 },
  15: { price: 1300, weight: 10, cat: 'ricesnack', shelf: 1 },
  16: { price: 1300, weight: 8, cat: 'instant', shelf: 365 },
  17: { price: 1300, weight: 7, cat: 'instant', shelf: 365 },
  18: { price: 1800, weight: 5, cat: 'frozen', shelf: 60 },
  19: { price: 1000, weight: 7, cat: 'frozen', shelf: 365 },
  20: { price: 1000, weight: 6, cat: 'frozen', shelf: 365 },
  21: { price: 2500, weight: 3, cat: 'snack', shelf: 240 },
  22: { price: 2200, weight: 5, cat: 'beverage', shelf: 365 },
  23: { price: 5500, weight: 2, cat: 'beverage', shelf: 730 },
  24: { price: 3200, weight: 6, cat: 'lunchbox', shelf: 2 },
  25: { price: 3500, weight: 3, cat: 'snack', shelf: 90 },
};
const PRODUCT_IDS = Object.keys(PRODUCTS).map(Number);

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
// 가중 랜덤으로 상품 1개 선택
function weightedProduct(): number {
  const total = PRODUCT_IDS.reduce((s, id) => s + PRODUCTS[id].weight, 0);
  let r = Math.random() * total;
  for (const id of PRODUCT_IDS) {
    r -= PRODUCTS[id].weight;
    if (r <= 0) return id;
  }
  return PRODUCT_IDS[0];
}
// 시간대 가중(점심 11~13, 저녁 17~20 피크)
function peakHour(): number {
  const buckets = [
    ...Array(2).fill(8), ...Array(2).fill(9), ...Array(3).fill(10),
    ...Array(6).fill(11), ...Array(7).fill(12), ...Array(5).fill(13),
    ...Array(3).fill(14), ...Array(2).fill(15), ...Array(3).fill(16),
    ...Array(5).fill(17), ...Array(6).fill(18), ...Array(6).fill(19),
    ...Array(4).fill(20), ...Array(3).fill(21), ...Array(1).fill(22),
  ];
  return pick(buckets);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function datetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function wipeStoreData(storeId: number): Promise<void> {
  const pool = getPool();
  // transaction_item / purchase_order_item 은 FK ON DELETE CASCADE 로 함께 삭제됨
  await pool.query('DELETE FROM `transaction` WHERE store_id = ?', [storeId]);
  await pool.query('DELETE FROM inventory_history WHERE store_id = ?', [storeId]);
  await pool.query('DELETE FROM purchase_order WHERE store_id = ?', [storeId]);
  await pool.query('DELETE FROM demand_forecast WHERE store_id = ?', [storeId]);
  await pool.query('DELETE FROM performance_kpi_daily WHERE store_id = ?', [storeId]);
  await pool.query('DELETE FROM inventory WHERE store_id = ?', [storeId]);
}

/** 오늘 기준 신선한 재고 — 유통기한 임박/저재고/결품을 의도적으로 섞는다. */
async function seedInventory(storeId: number, today: Date): Promise<void> {
  const pool = getPool();
  const rows: any[][] = [];
  const shelfPrefix = storeId === 1 ? 'A' : storeId === 2 ? 'B' : 'C';
  for (const id of PRODUCT_IDS) {
    const p = PRODUCTS[id];
    // 유통기한 — 신선식품일수록 짧게, 일부는 오늘/내일 임박
    let expires: string | null;
    if (p.shelf <= 2) expires = ymd(addDays(today, randInt(0, 2)));
    else if (p.shelf <= 14) expires = ymd(addDays(today, randInt(2, 10)));
    else if (p.shelf <= 120) expires = ymd(addDays(today, randInt(20, 80)));
    else expires = Math.random() < 0.4 ? null : ymd(addDays(today, randInt(120, 340)));

    // 수량 — 신선식품은 적게, 가끔 저재고/결품
    let qty: number;
    const roll = Math.random();
    if (roll < 0.08) qty = 0; // 결품
    else if (roll < 0.22) qty = randInt(1, 5); // 저재고
    else if (p.shelf <= 2) qty = randInt(8, 35);
    else qty = randInt(30, 140);

    rows.push([storeId, id, qty, `${shelfPrefix}-${String(id).padStart(2, '0')}`, expires]);
  }
  await pool.query(
    'INSERT INTO inventory (store_id, product_master_id, quantity, shelf_location, expires_at) VALUES ?',
    [rows],
  );
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 최근 DAYS 일치 거래 + 품목 + 재고 이력 생성 (점포 1곳). */
async function seedTransactions(storeId: number, today: Date): Promise<void> {
  const pool = getPool();
  const profile = STORE_PROFILE[storeId];

  const txRows: any[][] = []; // [store_id, pos_source, occurred_at, total_amount, payment_method]
  // 거래별 품목을 임시 보관 (transaction id 확정 후 매핑)
  const txItemsPerTx: Array<Array<{ pid: number; qty: number; price: number }>> = [];

  for (let d = DAYS - 1; d >= 0; d--) {
    const day = addDays(today, -d);
    const dow = day.getDay(); // 0=일,6=토
    const isWeekend = dow === 0 || dow === 6;
    let count = Math.round(profile.base * (isWeekend ? profile.weekendBoost : 1) * (0.8 + Math.random() * 0.4));
    // 오늘은 영업 중이라 절반 정도만 (진행 중인 하루)
    if (d === 0) count = Math.round(count * 0.55);

    for (let i = 0; i < count; i++) {
      const occurred = new Date(day);
      occurred.setHours(peakHour(), randInt(0, 59), randInt(0, 59), 0);

      const itemCount = randInt(1, 4);
      const chosen = new Map<number, { pid: number; qty: number; price: number }>();
      for (let k = 0; k < itemCount; k++) {
        const pid = weightedProduct();
        const qty = randInt(1, 3);
        const price = PRODUCTS[pid].price;
        if (chosen.has(pid)) chosen.get(pid)!.qty += qty;
        else chosen.set(pid, { pid, qty, price });
      }
      const items = Array.from(chosen.values());
      const total = items.reduce((s, it) => s + it.qty * it.price, 0);
      const posSource = Math.random() < 0.22 ? 'self_kiosk' : Math.random() < 0.1 ? 'app' : 'pos';
      const payment = pick(['card', 'card', 'mobile', 'mobile', 'cash']);

      txRows.push([storeId, posSource, datetime(occurred), total, payment]);
      txItemsPerTx.push(items);
    }
  }

  // 거래 일괄 삽입 후 시작 id 확보
  const [result]: any = await pool.query(
    'INSERT INTO `transaction` (store_id, pos_source, occurred_at, total_amount, payment_method) VALUES ?',
    [txRows],
  );
  const firstId = result.insertId as number;

  // 품목 + 재고 이력 일괄 삽입
  const itemRows: any[][] = [];
  const histRows: any[][] = [];
  for (let idx = 0; idx < txItemsPerTx.length; idx++) {
    const txId = firstId + idx;
    const occurredAt = txRows[idx][2];
    for (const it of txItemsPerTx[idx]) {
      itemRows.push([txId, it.pid, it.qty, it.price]);
      histRows.push([storeId, it.pid, -it.qty, 'sale', occurredAt]);
    }
  }
  // 배치 삽입 (대량이므로 청크 분할)
  await chunkedInsert(
    'INSERT INTO transaction_item (transaction_id, product_master_id, quantity, unit_price) VALUES ?',
    itemRows,
  );
  await chunkedInsert(
    'INSERT INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at) VALUES ?',
    histRows,
  );
  logger.info({ storeId, transactions: txRows.length, items: itemRows.length }, 'transactions seeded');
}

/** 신선식품 마감 폐기 — 현실적인 낮은 폐기율(약 1~3%)이 나오도록 소량 생성. */
async function seedDiscards(storeId: number, today: Date): Promise<void> {
  const perishables = PRODUCT_IDS.filter((id) => PRODUCTS[id].shelf <= 2); // 도시락·삼각김밥·샌드위치
  const histRows: any[][] = [];
  for (let d = DAYS - 1; d >= 1; d--) {
    // 오늘(d=0)은 영업 중이라 마감 폐기 제외
    const day = addDays(today, -d);
    // 하루에 2~3개 품목, 품목당 0~2개 마감 폐기
    const shuffled = [...perishables].sort(() => Math.random() - 0.5).slice(0, randInt(2, 3));
    for (const pid of shuffled) {
      const units = randInt(0, 2);
      if (units === 0) continue;
      const at = new Date(day);
      at.setHours(23, randInt(0, 50), 0, 0); // 마감 직후
      histRows.push([storeId, pid, -units, 'discard', datetime(at)]);
    }
  }
  if (histRows.length) {
    await chunkedInsert(
      'INSERT INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at) VALUES ?',
      histRows,
    );
  }
  logger.info({ storeId, discardEvents: histRows.length }, 'discards seeded');
}

async function chunkedInsert(sql: string, rows: any[][], chunk = 800): Promise<void> {
  const pool = getPool();
  for (let i = 0; i < rows.length; i += chunk) {
    await pool.query(sql, [rows.slice(i, i + chunk)]);
  }
}

/** 다양한 상태의 발주 생성 — 발주 대시보드가 풍부해 보이도록. */
async function seedOrders(storeId: number, today: Date, adminUserId: number | null): Promise<void> {
  const pool = getPool();

  // 상위 인기 상품 위주로 발주 품목 구성
  const topProducts = [...PRODUCT_IDS].sort((a, b) => PRODUCTS[b].weight - PRODUCTS[a].weight);

  type OrderSpec = {
    daysAgo: number;
    status: string;
    source: 'auto' | 'manual';
    sent?: boolean;
    received?: boolean;
    approved?: boolean;
    items: number;
  };
  const specs: OrderSpec[] = [
    { daysAgo: 6, status: 'received', source: 'auto', sent: true, received: true, approved: true, items: 7 },
    { daysAgo: 4, status: 'received', source: 'auto', sent: true, received: true, approved: true, items: 6 },
    { daysAgo: 2, status: 'sent', source: 'auto', sent: true, approved: true, items: 8 },
    { daysAgo: 1, status: 'approved', source: 'auto', approved: true, items: 6 },
    { daysAgo: 0, status: 'pending_review', source: 'auto', items: 9 },
    { daysAgo: 0, status: 'pending_review', source: 'auto', items: 5 },
    { daysAgo: 0, status: 'draft', source: 'manual', items: 4 },
  ];

  for (const s of specs) {
    const orderDate = addDays(today, -s.daysAgo);
    const sentAt = s.sent ? datetime(addHours(orderDate, 9)) : null;
    const receivedAt = s.received ? datetime(addHours(addDays(orderDate, 1), 7)) : null;
    const approvedBy = s.approved ? adminUserId : null;
    const [r]: any = await pool.query(
      `INSERT INTO purchase_order
         (store_id, order_date, status, source, sent_at, received_at, approved_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [storeId, ymd(orderDate), s.status, s.source, sentAt, receivedAt, approvedBy],
    );
    const orderId = r.insertId as number;
    const items = topProducts.slice(0, s.items).map((pid) => {
      const ordered = PRODUCTS[pid].shelf <= 2 ? randInt(20, 60) : randInt(10, 40);
      const received = s.received ? ordered - randInt(0, 3) : null;
      return [orderId, pid, ordered, received];
    });
    await pool.query(
      'INSERT INTO purchase_order_item (purchase_order_id, product_master_id, ordered_quantity, received_quantity) VALUES ?',
      [items],
    );
  }
  logger.info({ storeId, orders: specs.length }, 'orders seeded');
}

function addHours(d: Date, h: number): Date {
  const x = new Date(d);
  x.setHours(x.getHours() + h);
  return x;
}

async function main(): Promise<void> {
  const pool = getPool();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);

  const [adminRows] = await pool.query<any[]>(
    "SELECT id FROM `user` WHERE email = 'admin@example.com' LIMIT 1",
  );
  const adminUserId = adminRows.length ? Number(adminRows[0].id) : null;

  for (const storeId of STORES) {
    logger.info({ storeId }, 'refreshing demo data');
    await wipeStoreData(storeId);
    await seedInventory(storeId, today);
    await seedTransactions(storeId, today);
    await seedDiscards(storeId, today);
    await seedOrders(storeId, today, adminUserId);
    // 거래 이력 기반 내일자 수요예측
    await forecastStoreFor(storeId, tomorrow);
    // 최근 30일 KPI 일별 집계 (매출 리포트)
    await backfillRange(storeId, addDays(today, -(DAYS - 1)), today);
    logger.info({ storeId }, 'store refresh complete');
  }
  logger.info({ stores: STORES.length, days: DAYS }, 'demo data refresh complete');
}

if (require.main === module) {
  main()
    .catch((err) => {
      logger.error({ err: err.message, stack: err.stack }, 'demo refresh failed');
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
