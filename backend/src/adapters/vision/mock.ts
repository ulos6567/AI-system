/**
 * T063 — Vision 모의 어댑터 (사전녹화 동선 데이터셋 재생)
 *
 *   - 5초 간격으로 가상 세션의 dwell/path/approach/pickup/exit 이벤트 순차 재생
 *   - analytics_customer_behavior 에만 적재 — PII 미수집 (FR-020)
 *   - storeId 별로 단일 재생 인스턴스만 허용
 */
import { randomUUID } from 'node:crypto';
import type { VisionAdapter, VisionEvent } from '../../ports/vision';
import { getPool } from '../../db/pool';
import { logger } from '../../lib/logger';
import { audit } from '../../lib/audit';

interface Capture {
  storeId: number;
  handle: NodeJS.Timeout;
  sessionIds: string[];
  step: number;
}

const ACTIVE: Map<number, Capture> = new Map();

const SCRIPT: Array<{ delaySteps: number; event: Omit<VisionEvent, 'storeId' | 'anonSessionId' | 'occurredAt'> }> = [
  { delaySteps: 0, event: { eventType: 'approach_shelf', zoneCode: 'A1', productMasterId: 4, dwellSeconds: 0 } },
  { delaySteps: 1, event: { eventType: 'dwell',          zoneCode: 'A1', productMasterId: 4, dwellSeconds: 8 } },
  { delaySteps: 2, event: { eventType: 'pickup',         zoneCode: 'A1', productMasterId: 4 } },
  { delaySteps: 3, event: { eventType: 'path',           zoneCode: 'A2' } },
  { delaySteps: 4, event: { eventType: 'approach_shelf', zoneCode: 'B1', productMasterId: 11 } },
  { delaySteps: 5, event: { eventType: 'dwell',          zoneCode: 'B1', productMasterId: 11, dwellSeconds: 5 } },
  { delaySteps: 6, event: { eventType: 'pickup',         zoneCode: 'B1', productMasterId: 11 } },
  { delaySteps: 7, event: { eventType: 'exit',           zoneCode: 'EXIT' } },
];

async function persistEvent(ev: VisionEvent): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO analytics_customer_behavior
       (store_id, anon_session_id, event_type, zone_code, product_master_id, dwell_seconds, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      ev.storeId,
      ev.anonSessionId,
      ev.eventType,
      ev.zoneCode ?? null,
      ev.productMasterId ?? null,
      ev.dwellSeconds ?? null,
      ev.occurredAt,
    ],
  );
}

const adapter: VisionAdapter = {
  name: 'vision-mock',

  async startCapture(storeId: number, onEvent: (ev: VisionEvent) => Promise<void>) {
    if (ACTIVE.has(storeId)) {
      logger.warn({ storeId }, 'vision-mock already capturing');
      return;
    }

    const sessionIds: string[] = [randomUUID(), randomUUID()];
    const capture: Capture = {
      storeId,
      sessionIds,
      step: 0,
      handle: setInterval(async () => {
        const step = capture.step++;
        for (const stepDef of SCRIPT.filter((s) => s.delaySteps === step % SCRIPT.length)) {
          const sid = sessionIds[step % sessionIds.length];
          const ev: VisionEvent = {
            ...stepDef.event,
            storeId,
            anonSessionId: sid,
            occurredAt: new Date(),
          };
          try {
            await persistEvent(ev);
            await onEvent(ev);
          } catch (err: any) {
            logger.error({ err: err.message, storeId, ev }, 'vision-mock persist failed');
          }
        }
        // 한 사이클 종료 시 새 세션 ID 회전
        if (step > 0 && step % SCRIPT.length === SCRIPT.length - 1) {
          sessionIds[step % sessionIds.length] = randomUUID();
        }
      }, 5000),
    };
    ACTIVE.set(storeId, capture);

    await audit({
      storeId,
      eventType: 'vision.capture_started',
      message: `vision-mock capture started (sessions=${sessionIds.length})`,
      metadata: { sessions: sessionIds.length, scriptSteps: SCRIPT.length },
    });
    logger.info({ storeId, sessions: sessionIds.length }, 'vision-mock capture started');
  },

  async stopCapture(storeId: number) {
    const c = ACTIVE.get(storeId);
    if (!c) return;
    clearInterval(c.handle);
    ACTIVE.delete(storeId);
    await audit({ storeId, eventType: 'vision.capture_stopped', message: 'vision-mock capture stopped' });
    logger.info({ storeId }, 'vision-mock capture stopped');
  },
};

export function isCapturing(storeId: number): boolean {
  return ACTIVE.has(storeId);
}

export default adapter;
