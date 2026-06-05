import { api } from './client';

export interface AnomalyEvent {
  id: number;
  storeId: number;
  anomalyType: 'unpaid_exit' | 'disturbance' | 'collapse' | 'intrusion';
  severity: number;
  zoneCode: string | null;
  detectedAt: string;
  notifiedAt: string | null;
  escalated: boolean;
  falsePositive: boolean | null;
  resolution: string | null;
}

export const anomaliesApi = {
  list: (storeId: number, opts: { falsePositive?: boolean; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.falsePositive !== undefined) q.set('falsePositive', String(opts.falsePositive));
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return api<{ storeId: number; anomalies: AnomalyEvent[] }>(
      `/stores/${storeId}/anomalies${qs ? `?${qs}` : ''}`,
    );
  },
  sla: (storeId: number) =>
    api<{ storeId: number; sla: { count: number; maxDelaySec: number } }>(`/stores/${storeId}/anomalies/sla`),
  simulate: (storeId: number) =>
    api<{ ok: true; anomalyId: number }>(`/stores/${storeId}/anomalies/simulate`, { method: 'POST' }),
  feedback: (storeId: number, id: number, body: { falsePositive?: boolean; resolution?: string }) =>
    api<{ ok: true }>(`/stores/${storeId}/anomalies/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
