/**
 * 002 (T013) — 신호 탐지·처방 생성 스케줄러
 *   - 30분마다 활성 점포 전체에 대해 신호 탐지 + 처방(proposed) 생성.
 *   - 생성된 처방은 점주 승인 전까지 실행되지 않는다(FR-003).
 */
import { generateForAllStores } from '../services/prescription';
import { logger } from '../lib/logger';
import { audit } from '../lib/audit';

const POLL_MS = 30 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const r = await generateForAllStores();
    if (r.actions > 0) {
      await audit({
        eventType: 'insight.batch_run',
        severity: 'info',
        message: `stores=${r.stores} actions=${r.actions}`,
        metadata: r,
      });
    }
    logger.debug(r, 'signal-detect tick');
  } catch (err: any) {
    logger.error({ err: err.message }, 'signal-detect tick failed');
  }
}

export function startSignalDetect(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_MS);
  logger.info({ intervalMin: POLL_MS / 60000 }, 'signal-detect started');
}

export function stopSignalDetect(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
