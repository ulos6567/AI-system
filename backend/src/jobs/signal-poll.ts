/**
 * T027 동반 — 외부 신호 폴링 잡
 *   weather-kma 어댑터를 30분마다 호출해 external_signal 에 적재.
 */
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';
import weatherAdapter from '../adapters/signal/weather-kma';

const POLL_MS = 30 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const signals = await weatherAdapter.poll({ regionCode: '11000' });
    const pool = getPool();
    for (const s of signals) {
      await pool.query(
        `INSERT INTO external_signal (store_id, region_code, signal_type, occurred_at, payload_json, source)
           VALUES (?, ?, ?, ?, ?, ?)`,
        [s.storeId ?? null, s.regionCode ?? null, s.signalType, s.occurredAt, JSON.stringify(s.payload), s.source],
      );
    }
    logger.debug({ count: signals.length }, 'signal poll ok');
  } catch (err: any) {
    logger.error({ err: err.message }, 'signal poll failed');
  }
}

export function startSignalPoll(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_MS);
  // 부팅 직후 1회 즉시
  tick();
  logger.info({ intervalMin: POLL_MS / 60000 }, 'signal-poll started');
}

export function stopSignalPoll(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
