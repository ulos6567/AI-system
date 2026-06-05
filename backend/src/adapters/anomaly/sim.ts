/**
 * 002 (T024) — 이상 징후 시뮬레이션 어댑터
 *   미결제 퇴장(unpaid_exit)·소란(disturbance)·쓰러짐(collapse)·침입(intrusion)을
 *   주기적으로 생성해 onEvent 로 흘려보낸다. 실제 전환 시 영상분석 결과 스트림으로 교체.
 */
import type { AnomalyAdapter, AnomalySignal, AnomalyType } from '../../ports/anomaly';
import { logger } from '../../lib/logger';

interface Sub {
  storeId: number;
  handle: NodeJS.Timeout;
}

const ACTIVE = new Map<number, Sub>();

const TICK_MS = 25_000; // 틱마다 일정 확률로 이상 이벤트 생성 (SLA 시연용)
const EMIT_PROBABILITY = 0.7;

const TYPE_TABLE: Array<{ type: AnomalyType; severity: number; zone: string; weight: number }> = [
  { type: 'unpaid_exit', severity: 3, zone: 'EXIT', weight: 5 },
  { type: 'disturbance', severity: 2, zone: 'A1', weight: 3 },
  { type: 'collapse', severity: 5, zone: 'B2', weight: 1 },
  { type: 'intrusion', severity: 4, zone: 'ENTRANCE', weight: 1 },
];

function pickType(seed: number): { type: AnomalyType; severity: number; zone: string } {
  const total = TYPE_TABLE.reduce((s, t) => s + t.weight, 0);
  let r = (seed % 1000) / 1000 * total;
  for (const t of TYPE_TABLE) {
    r -= t.weight;
    if (r <= 0) return { type: t.type, severity: t.severity, zone: t.zone };
  }
  return { type: TYPE_TABLE[0].type, severity: TYPE_TABLE[0].severity, zone: TYPE_TABLE[0].zone };
}

/** 단일 이상 이벤트 생성 (잡/테스트에서 즉시 주입에도 사용) */
export function generateAnomaly(storeId: number): AnomalySignal {
  const { type, severity, zone } = pickType(Math.floor(Math.random() * 1000));
  return {
    storeId,
    anomalyType: type,
    severity,
    zoneCode: zone,
    snapshotRef: `sim://snapshot/${storeId}/${Date.now()}`,
    detectedAt: new Date(),
  };
}

const adapter: AnomalyAdapter = {
  name: 'anomaly-sim',

  async subscribe(storeId: number, onEvent: (ev: AnomalySignal) => Promise<void>) {
    if (ACTIVE.has(storeId)) {
      logger.warn({ storeId }, 'anomaly-sim already subscribed');
      return;
    }
    const handle = setInterval(async () => {
      if (Math.random() > EMIT_PROBABILITY) return;
      const ev = generateAnomaly(storeId);
      try {
        await onEvent(ev);
      } catch (err: any) {
        logger.error({ err: err.message, storeId }, 'anomaly-sim onEvent failed');
      }
    }, TICK_MS);
    ACTIVE.set(storeId, { storeId, handle });
    logger.info({ storeId, tickMs: TICK_MS }, 'anomaly-sim subscribed');
  },

  async unsubscribe(storeId: number) {
    const s = ACTIVE.get(storeId);
    if (!s) return;
    clearInterval(s.handle);
    ACTIVE.delete(storeId);
    logger.info({ storeId }, 'anomaly-sim unsubscribed');
  },
};

export default adapter;
