/**
 * T040 — 이벤트 디스패처 (FR-016)
 *
 *   audit() 가 event_log 적재에 성공한 직후 호출된다(audit.ts 내부에서 fire-and-forget).
 *   동작:
 *     1) severity 가 'warn' 이상이거나 alertable event_type 인 경우에만 사용자 알림 생성
 *     2) storeId 가 지정되면 해당 점포의 STORE_OWNER/STORE_STAFF 사용자들에게 notification 행 적재
 *     3) SSE 채널 `store:<id>` 와 `user:<id>` 로 동시 push
 *
 *   이 모듈은 audit.ts 의 의존성 사이클을 피하기 위해 logger 외 audit 를 import 하지 않는다.
 */
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';
import { getEventBus } from '../lib/sse';

export type Severity = 'info' | 'warn' | 'error' | 'critical';

export interface DispatchInput {
  eventLogId: number;
  storeId?: number | null;
  userId?: number | null;
  severity: Severity;
  eventType: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

const ALERTABLE_TYPES = new Set([
  'order.auto_held',
  'order.auto_sent',
  'order.send_failed',
  'inventory.stockout',
  'pos.ingest.rejected',
  'mapping.pending',
  'system.down',
  'system.recovered',
  'sync.flushed',
  'pricing.applied',
]);

function shouldNotify(input: DispatchInput): boolean {
  if (input.severity === 'warn' || input.severity === 'error' || input.severity === 'critical') return true;
  return ALERTABLE_TYPES.has(input.eventType);
}

function shortTitle(input: DispatchInput): string {
  switch (input.eventType) {
    case 'order.auto_held': return '⚠️ 자동 발주 보류';
    case 'order.auto_sent': return '✅ 자동 발주 송신';
    case 'order.send_failed': return '❌ 발주 송신 실패';
    case 'inventory.stockout': return '⚠️ 결품 발생';
    case 'pos.ingest.rejected': return '⚠️ POS 거래 거부';
    case 'mapping.pending': return '🔗 상품 매핑 검토 필요';
    case 'system.down': return '🚨 시스템 장애';
    case 'system.recovered': return '✅ 시스템 복구';
    case 'sync.flushed': return '🔄 오프라인 데이터 동기화';
    case 'pricing.applied': return '💲 동적 가격 적용';
    default: return `[${input.severity}] ${input.eventType}`;
  }
}

async function notifiableUsersFor(storeId: number): Promise<number[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT user_id FROM store_user WHERE store_id = ? AND store_role IN ('STORE_OWNER','STORE_STAFF')`,
    [storeId],
  );
  return rows.map((r: any) => Number(r.user_id));
}

export async function dispatch(input: DispatchInput): Promise<void> {
  if (!shouldNotify(input)) return;
  try {
    const bus = getEventBus();
    const payload = {
      eventLogId: input.eventLogId,
      eventType: input.eventType,
      severity: input.severity,
      message: input.message ?? null,
      metadata: input.metadata ?? null,
      ts: new Date().toISOString(),
    };

    // 점포 채널 push (대시보드)
    if (input.storeId) {
      bus.publish(`store:${input.storeId}`, { type: 'event', data: payload });

      const userIds = await notifiableUsersFor(input.storeId);
      const pool = getPool();
      const title = shortTitle(input);
      const body = input.message ?? input.eventType;
      for (const uid of userIds) {
        const [res]: any = await pool.query(
          `INSERT INTO notification (store_id, user_id, event_log_id, title, body, delivered_channels_json)
             VALUES (?, ?, ?, ?, ?, JSON_ARRAY('sse'))`,
          [input.storeId, uid, input.eventLogId, title, body],
        );
        bus.publish(`user:${uid}`, {
          type: 'notification',
          data: { id: res.insertId, title, body, severity: input.severity, eventType: input.eventType, createdAt: new Date().toISOString() },
        });
      }
    } else {
      bus.publish('global', { type: 'event', data: payload });
    }
  } catch (err: any) {
    logger.error({ err: err.message, input }, 'event-dispatcher failed');
  }
}
