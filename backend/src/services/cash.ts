/**
 * 시재 점검 서비스
 *   - 예상 시재 = 직전 점검 실측액(opening_float) + 그 이후 현금 매출(cash_sales)
 *   - 과부족(difference) = 실측 시재 - 예상 시재
 *   - 직전 점검이 없으면 당일 0시를 기준으로 현금 매출을 합산하고 기준액 0 으로 본다.
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';

const DEFAULT_OPENING_FLOAT = 100000; // 점검 이력이 전혀 없을 때 가정하는 기본 준비금(시재금)

export type Shift = 'open' | 'mid' | 'close';

export interface CashCountRow {
  id: number;
  countedAt: string;
  shift: Shift;
  openingFloat: number;
  cashSales: number;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  denominations: Record<string, number> | null;
  memo: string | null;
  userName: string | null;
}

export interface CashStatus {
  /** 직전 점검 시각(없으면 null) */
  lastCountedAt: string | null;
  /** 직전 점검 실측액 — 이번 예상 시재의 기준액 */
  openingFloat: number;
  /** 직전 점검(또는 당일 0시) 이후 현금 매출 합계 */
  cashSales: number;
  cashTxCount: number;
  /** 예상 시재 */
  expectedAmount: number;
  sinceLabel: string;
}

async function lastCount(storeId: number): Promise<{ countedAt: string; countedAmount: number } | null> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT DATE_FORMAT(counted_at, '%Y-%m-%d %H:%i:%s') AS countedAt, counted_amount AS countedAmount
       FROM cash_count WHERE store_id = ? ORDER BY counted_at DESC, id DESC LIMIT 1`,
    [storeId],
  );
  if (!rows.length) return null;
  return { countedAt: String(rows[0].countedAt), countedAmount: Number(rows[0].countedAmount) };
}

/** 기준 시점 이후 현금 매출 합계 */
async function cashSalesSince(storeId: number, since: string | null): Promise<{ sum: number; count: number }> {
  const pool = getPool();
  const where = since
    ? 'store_id = ? AND payment_method = ? AND occurred_at > ?'
    : 'store_id = ? AND payment_method = ? AND occurred_at >= CURRENT_DATE';
  const args = since ? [storeId, 'cash', since] : [storeId, 'cash'];
  const [rows] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(total_amount), 0) AS sum, COUNT(*) AS cnt
       FROM \`transaction\` WHERE ${where}`,
    args,
  );
  return { sum: Number(rows[0]?.sum ?? 0), count: Number(rows[0]?.cnt ?? 0) };
}

export async function getStatus(storeId: number): Promise<CashStatus> {
  const last = await lastCount(storeId);
  const openingFloat = last ? last.countedAmount : DEFAULT_OPENING_FLOAT;
  const { sum, count } = await cashSalesSince(storeId, last ? last.countedAt : null);
  return {
    lastCountedAt: last ? last.countedAt : null,
    openingFloat,
    cashSales: sum,
    cashTxCount: count,
    expectedAmount: openingFloat + sum,
    sinceLabel: last ? `직전 점검(${last.countedAt.slice(0, 16).replace('T', ' ')}) 이후` : '당일 영업 시작 이후',
  };
}

export async function listCounts(storeId: number, limit = 30): Promise<CashCountRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT cc.id, DATE_FORMAT(cc.counted_at, '%Y-%m-%d %H:%i:%s') AS countedAt, cc.shift,
            cc.opening_float AS openingFloat, cc.cash_sales AS cashSales,
            cc.expected_amount AS expectedAmount, cc.counted_amount AS countedAmount,
            cc.difference, cc.denominations_json AS denominations, cc.memo,
            u.display_name AS userName
       FROM cash_count cc
       LEFT JOIN \`user\` u ON u.id = cc.user_id
      WHERE cc.store_id = ?
      ORDER BY cc.counted_at DESC, cc.id DESC
      LIMIT ?`,
    [storeId, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    countedAt: String(r.countedAt),
    shift: r.shift,
    openingFloat: Number(r.openingFloat),
    cashSales: Number(r.cashSales),
    expectedAmount: Number(r.expectedAmount),
    countedAmount: Number(r.countedAmount),
    difference: Number(r.difference),
    denominations: r.denominations ?? null,
    memo: r.memo,
    userName: r.userName ?? null,
  }));
}

export interface CreateCountInput {
  shift: Shift;
  countedAmount: number;
  denominations?: Record<string, number> | null;
  memo?: string | null;
}

export async function createCount(
  storeId: number,
  userId: number | null,
  input: CreateCountInput,
): Promise<CashCountRow & { status: CashStatus }> {
  const status = await getStatus(storeId);
  const expected = status.expectedAmount;
  const difference = input.countedAmount - expected;
  const pool = getPool();
  const [res]: any = await pool.query(
    `INSERT INTO cash_count
       (store_id, user_id, counted_at, shift, opening_float, cash_sales,
        expected_amount, counted_amount, difference, denominations_json, memo)
     VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      storeId,
      userId,
      input.shift,
      status.openingFloat,
      status.cashSales,
      expected,
      input.countedAmount,
      difference,
      input.denominations ? JSON.stringify(input.denominations) : null,
      input.memo ?? null,
    ],
  );
  const id = res.insertId as number;

  await audit({
    storeId,
    userId,
    severity: Math.abs(difference) >= 1000 ? 'warn' : 'info',
    eventType: 'cash.count_recorded',
    message: `시재점검(${input.shift}) 실측 ${Math.round(input.countedAmount).toLocaleString('ko-KR')}원 / 예상 ${Math.round(expected).toLocaleString('ko-KR')}원 / 과부족 ${difference >= 0 ? '+' : ''}${Math.round(difference).toLocaleString('ko-KR')}원`,
    metadata: { cashCountId: id, shift: input.shift, expected, counted: input.countedAmount, difference },
  });

  const [created] = await listCounts(storeId, 1);
  // 점검 직후의 새 상태(다음 점검 기준)도 함께 반환
  return { ...created, status: await getStatus(storeId) };
}
