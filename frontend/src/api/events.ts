import { api } from './client';

export interface EventLogRow {
  id: number;
  severity: 'info' | 'warn' | 'error' | 'critical';
  eventType: string;
  message: string | null;
  metadata: unknown;
  occurredAt: string;
}

export interface NotificationRow {
  id: number;
  storeId: number;
  eventLogId: number | null;
  title: string;
  body: string | null;
  readAt: string | null;
  deliveredChannels: unknown;
  createdAt: string;
}

export const eventsApi = {
  list(storeId: number, opts: { severity?: string; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (opts.severity) q.set('severity', opts.severity);
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return api<{ storeId: number; events: EventLogRow[] }>(
      `/stores/${storeId}/events${qs ? `?${qs}` : ''}`,
    );
  },
  notifications(storeId: number, unread = false) {
    return api<{ unreadCount: number; notifications: NotificationRow[] }>(
      `/stores/${storeId}/events/notifications${unread ? '?unread=1' : ''}`,
    );
  },
  markRead(storeId: number, id: number) {
    return api<{ ok: true; id: number; updated: number }>(
      `/stores/${storeId}/events/notifications/${id}`,
      { method: 'PATCH', body: '{}' },
    );
  },
  markAllRead(storeId: number) {
    return api<{ ok: true; updated: number }>(
      `/stores/${storeId}/events/notifications/mark-all-read`,
      { method: 'POST', body: '{}' },
    );
  },
};
