/**
 * T033 — 자동 발주 스케줄러
 *   - 점포별 마감 시각(open_hours_json 끝에서 -2h 기본)에 generateAutoOrder 호출.
 *   - 1차 구현은 단순 setInterval 폴링(매 30분). 정밀 cron 은 후속(node-cron) 단계.
 */
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';
import { generateAutoOrder } from '../services/auto-order';
import { audit } from '../lib/audit';

const POLL_INTERVAL_MS = 30 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;
const lastRunDay = new Map<number, string>(); // storeId -> YYYY-MM-DD

async function listActiveStores(): Promise<Array<{ id: number; openHours: any }>> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, open_hours_json AS openHours FROM store WHERE status = 'active'`,
  );
  return rows;
}

function shouldRunNow(openHours: any): boolean {
  // 기본 마감 22시. open_hours_json.<요일> = "HH-HH" 포맷에서 종료 시각의 -2h 이내면 트리거.
  const now = new Date();
  const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
  const range: string | undefined = openHours?.[dow];
  const closeHour = range ? Number(range.split('-')[1]) : 22;
  const triggerHour = Math.max(0, (Number.isFinite(closeHour) ? closeHour : 22) - 2);
  return now.getHours() >= triggerHour;
}

async function tick(): Promise<void> {
  try {
    const stores = await listActiveStores();
    const todayKey = new Date().toISOString().slice(0, 10);
    for (const s of stores) {
      if (lastRunDay.get(s.id) === todayKey) continue;
      if (!shouldRunNow(s.openHours)) continue;
      try {
        const r = await generateAutoOrder({ storeId: s.id, userId: null });
        lastRunDay.set(s.id, todayKey);
        await audit({
          storeId: s.id,
          eventType: 'order.auto_run_complete',
          message: `scheduler poid=${r.purchaseOrderId} status=${r.status}`,
          metadata: { purchaseOrderId: r.purchaseOrderId, status: r.status },
        });
      } catch (err: any) {
        logger.error({ err: err.message, storeId: s.id }, 'auto-order scheduler tick failed');
      }
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'auto-order scheduler error');
  }
}

export function startAutoOrderScheduler(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_INTERVAL_MS);
  logger.info({ intervalMin: POLL_INTERVAL_MS / 60000 }, 'auto-order scheduler started');
}

export function stopAutoOrderScheduler(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
