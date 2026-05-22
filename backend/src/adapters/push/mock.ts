/**
 * T052 — 푸시 모의 어댑터 (콘솔/DB)
 *   - 콘솔 + DB notification 적재 동시. 실제 FCM/APNs 전환 시 send 만 교체.
 *   - 디스패처는 notification 적재를 독립 수행하므로, 본 어댑터는 단순 "푸시 채널" 시뮬레이션.
 */
import type { PushAdapter, PushMessage } from '../../ports/push';
import { logger } from '../../lib/logger';
import { getPool } from '../../db/pool';

interface PushRecord {
  id: string;
  msg: PushMessage;
  sentAt: Date;
}

const SENT: PushRecord[] = [];

const adapter: PushAdapter = {
  name: 'push-mock',
  async send(msg: PushMessage) {
    const id = `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    SENT.push({ id, msg, sentAt: new Date() });

    // DB notification 행 적재 (디스패처와 중복되지 않도록 'push' 채널로 명시)
    if (msg.storeId) {
      try {
        const pool = getPool();
        await pool.query(
          `INSERT INTO notification (store_id, user_id, title, body, delivered_channels_json)
             VALUES (?, ?, ?, ?, JSON_ARRAY('push'))`,
          [msg.storeId, msg.userId, msg.title, msg.body],
        );
      } catch (err: any) {
        logger.warn({ err: err.message }, 'push-mock notification insert failed (non-fatal)');
      }
    }

    logger.info({ id, userId: msg.userId, storeId: msg.storeId, title: msg.title }, 'push-mock send');
    return { messageId: id, channel: 'console' as const };
  },
};

export function getRecentPushSends(limit = 100): PushRecord[] {
  return SENT.slice(-limit).reverse();
}

export default adapter;
