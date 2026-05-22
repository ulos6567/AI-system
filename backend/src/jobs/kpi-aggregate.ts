/**
 * T059 — KPI 집계 스케줄러
 *   - 매시간 폴링하여 현재 시각이 자정~01시 사이면 어제 날짜 집계 1회 실행.
 *   - 부팅 직후 1회 즉시 — 어제와 오늘(부분) 집계 갱신.
 */
import { aggregateAllStoresFor } from '../services/kpi';
import { logger } from '../lib/logger';

const POLL_MS = 60 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;
let lastRunDay: string | null = null;

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function tick(): Promise<void> {
  try {
    const now = new Date();
    // 자정~01시: 어제 집계
    if (now.getHours() <= 1) {
      const dayKey = yesterday().toISOString().slice(0, 10);
      if (lastRunDay !== dayKey) {
        await aggregateAllStoresFor(yesterday());
        lastRunDay = dayKey;
        logger.info({ day: dayKey }, 'kpi aggregate ran for yesterday');
      }
    }
    // 어떤 시각이든 오늘 부분 집계는 1회/시간 갱신
    await aggregateAllStoresFor(new Date());
  } catch (err: any) {
    logger.error({ err: err.message }, 'kpi-aggregate tick failed');
  }
}

export function startKpiAggregate(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_MS);
  tick();
  logger.info({ intervalMin: POLL_MS / 60000 }, 'kpi-aggregate started');
}

export function stopKpiAggregate(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
