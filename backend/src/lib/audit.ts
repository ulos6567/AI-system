/**
 * 감사 헬퍼 (T021, FR-021)
 *   - event_log 적재의 유일한 진입점.
 *   - 호출 측은 도메인/HTTP 레이어에서만 사용. DB 레이어에서는 직접 INSERT 금지.
 */
import { getPool } from '../db/pool';
import { logger } from './logger';
import { dispatch } from '../services/event-dispatcher';

export type Severity = 'info' | 'warn' | 'error' | 'critical';

export interface AuditEvent {
  storeId?: number | null;
  userId?: number | null;
  severity?: Severity;
  eventType: string;
  message?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export async function audit(ev: AuditEvent): Promise<number> {
  const pool = getPool();
  const occurredAt = ev.occurredAt ?? new Date();
  try {
    const [result]: any = await pool.query(
      `INSERT INTO event_log
         (store_id, user_id, severity, event_type, message, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ev.storeId ?? null,
        ev.userId ?? null,
        ev.severity ?? 'info',
        ev.eventType,
        ev.message ?? null,
        ev.metadata ? JSON.stringify(ev.metadata) : null,
        occurredAt,
      ],
    );
    const eventLogId = result.insertId as number;
    // 디스패처는 fire-and-forget — 실패해도 audit 흐름을 막지 않는다.
    dispatch({
      eventLogId,
      storeId: ev.storeId ?? null,
      userId: ev.userId ?? null,
      severity: ev.severity ?? 'info',
      eventType: ev.eventType,
      message: ev.message,
      metadata: ev.metadata,
    }).catch((err) => logger.error({ err: err.message }, 'dispatch failed (non-fatal)'));
    return eventLogId;
  } catch (err: any) {
    // 감사 실패가 도메인 흐름을 막지 않도록 — 로그로 적재 시도
    logger.error({ err: err.message, ev }, 'audit insert failed');
    return -1;
  }
}
