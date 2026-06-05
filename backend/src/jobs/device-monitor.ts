/**
 * 002 (T042) — 장비 모니터링 잡
 *   주기적으로 활성 점포의 IoT 센서값을 폴링·적재하고 예지보전 평가를 수행한다.
 *   임계 위험은 평가 단계에서 즉시 알림으로 격상된다(SC-004).
 */
import { ingestReadings, evaluateAllDevices } from '../services/device-health';
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';

const POLL_MS = 5 * 60 * 1000; // 5분
let handle: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const pool = getPool();
    const [stores] = await pool.query<any[]>(`SELECT id FROM store WHERE status = 'active'`);
    let totalAlerts = 0;
    for (const s of stores) {
      const storeId = Number(s.id);
      await ingestReadings(storeId);
      const r = await evaluateAllDevices(storeId);
      totalAlerts += r.alerts;
    }
    if (totalAlerts > 0) logger.info({ alerts: totalAlerts }, 'device-monitor raised alerts');
  } catch (err: any) {
    logger.error({ err: err.message }, 'device-monitor tick failed');
  }
}

export function startDeviceMonitor(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_MS);
  logger.info({ intervalMin: POLL_MS / 60000 }, 'device-monitor started');
}

export function stopDeviceMonitor(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
