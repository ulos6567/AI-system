/**
 * 002 (T012) — 처방 효과 검증 스케줄러 (closed-loop, FR-004)
 *   - 1시간마다 검증 기간이 지난 실행 처방의 실제 효과를 계산해 action_outcome 을 채운다.
 */
import { verifyDueActions } from '../services/prescription';
import { logger } from '../lib/logger';

const POLL_MS = 60 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const n = await verifyDueActions();
    logger.debug({ verified: n }, 'action-verify tick');
  } catch (err: any) {
    logger.error({ err: err.message }, 'action-verify tick failed');
  }
}

export function startActionVerify(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_MS);
  logger.info({ intervalMin: POLL_MS / 60000 }, 'action-verify started');
}

export function stopActionVerify(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
