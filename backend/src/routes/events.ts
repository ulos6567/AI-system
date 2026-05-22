/**
 * T041 — GET /api/stores/:storeId/events           — 점포 event_log 최근 100건
 *        GET /api/stores/:storeId/notifications    — 사용자 알림함 (읽지 않은 + 최근)
 *        PATCH /notifications/:id                  — 읽음 처리
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import { getPool } from '../db/pool';
import type { SessionUser } from '../middleware/auth/session';

const router = Router({ mergeParams: true });

function currentUserId(req: any): number {
  return (req.session?.user as SessionUser | undefined)?.id ?? req.jwtUser?.id ?? 0;
}

router.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const severity = (req.query.severity as string | undefined) ?? null;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const pool = getPool();
  const args: any[] = [storeId];
  let where = 'WHERE store_id = ?';
  if (severity) {
    where += ' AND severity = ?';
    args.push(severity);
  }
  const [rows] = await pool.query<any[]>(
    `SELECT id, severity, event_type AS eventType, message, metadata_json AS metadata,
            occurred_at AS occurredAt, created_at AS createdAt
       FROM event_log ${where}
      ORDER BY occurred_at DESC
      LIMIT ?`,
    [...args, limit],
  );
  res.json({ storeId, events: rows });
});

router.get('/notifications', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const pool = getPool();
  let where = 'WHERE user_id = ?';
  if (onlyUnread) where += ' AND read_at IS NULL';
  const [rows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, event_log_id AS eventLogId, title, body,
            read_at AS readAt, delivered_channels_json AS deliveredChannels,
            created_at AS createdAt
       FROM notification ${where}
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit],
  );
  const [[unreadRow]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS unread FROM notification WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  ) as any;
  res.json({ unreadCount: Number(unreadRow.unread ?? 0), notifications: rows });
});

router.patch('/notifications/:id', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const id = Number(req.params.id);
  const pool = getPool();
  const [result]: any = await pool.query(
    `UPDATE notification SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL`,
    [id, userId],
  );
  res.json({ ok: true, id, updated: result.affectedRows });
});

router.post('/notifications/mark-all-read', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const pool = getPool();
  const [result]: any = await pool.query(
    `UPDATE notification SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  res.json({ ok: true, updated: result.affectedRows });
});

export default router;
