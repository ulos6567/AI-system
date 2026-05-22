/**
 * T055 — 가격 트리거 스케줄러
 *   - 15분마다 evaluateAllActive() 호출 (manual 제외).
 *   - dispatcher 가 pricing.applied 이벤트를 SSE + notification 으로 자동 전파.
 */
import { evaluateAllActive } from '../services/pricing';
import { logger } from '../lib/logger';
import { audit } from '../lib/audit';

const POLL_MS = 15 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const r = await evaluateAllActive();
    if (r.applied.length > 0) {
      await audit({
        eventType: 'pricing.batch_run',
        severity: 'info',
        message: `evaluated=${r.evaluated} applied=${r.applied.length}`,
        metadata: { evaluated: r.evaluated, applied: r.applied.length },
      });
    }
    logger.debug({ evaluated: r.evaluated, applied: r.applied.length }, 'pricing-trigger tick');
  } catch (err: any) {
    logger.error({ err: err.message }, 'pricing-trigger tick failed');
  }
}

export function startPricingTrigger(): void {
  if (handle) return;
  handle = setInterval(tick, POLL_MS);
  logger.info({ intervalMin: POLL_MS / 60000 }, 'pricing-trigger started');
}

export function stopPricingTrigger(): void {
  if (handle) clearInterval(handle);
  handle = null;
}
