/**
 * 002 (T026) — 이상 징후 시뮬레이터 잡
 *   활성 점포 전체에 대해 이상 어댑터를 구독하고, 수신 이벤트를 anomaly 서비스로 적재한다.
 *   (시뮬레이션 어댑터가 주기적으로 이상 이벤트를 생성 → 즉시 알림 SLA 검증)
 */
import { getAnomalyAdapter } from '../adapters/factory';
import { ingestAnomaly } from '../services/anomaly';
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';

let started = false;

export async function startAnomalySim(): Promise<void> {
  if (started) return;
  started = true;
  const adapter = getAnomalyAdapter();
  const pool = getPool();
  try {
    const [stores] = await pool.query<any[]>(`SELECT id FROM store WHERE status = 'active'`);
    for (const s of stores) {
      const storeId = Number(s.id);
      await adapter.subscribe(storeId, async (ev) => {
        await ingestAnomaly(ev);
      });
    }
    logger.info({ stores: stores.length, adapter: adapter.name }, 'anomaly-sim job started');
  } catch (err: any) {
    logger.error({ err: err.message }, 'anomaly-sim job failed to start');
  }
}

export async function stopAnomalySim(): Promise<void> {
  if (!started) return;
  const adapter = getAnomalyAdapter();
  const pool = getPool();
  const [stores] = await pool.query<any[]>(`SELECT id FROM store`);
  for (const s of stores) await adapter.unsubscribe(Number(s.id));
  started = false;
}
