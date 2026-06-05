import { api } from './client';

export interface OperationalSignal {
  id: number;
  storeId: number;
  signalType: 'sales_drop' | 'waste_risk' | 'demand_surge' | 'overstock' | 'weather_impact';
  severity: number;
  productId: number | null;
  detectedAt: string;
  payload: Record<string, unknown> | null;
  status: 'open' | 'actioned' | 'dismissed' | 'expired';
}

export interface PrescriptiveAction {
  id: number;
  signalId: number;
  storeId: number;
  actionType: 'price_markdown' | 'promotion' | 'reorder' | 'reallocate' | 'staffing';
  targetProductId: number | null;
  targetProductName: string | null;
  recommendation: Record<string, unknown> | null;
  expectedEffect: Record<string, unknown> | null;
  rationale: string | null;
  confidence: number;
  priority: number;
  status: 'proposed' | 'approved' | 'executed' | 'rejected' | 'expired';
  approvedBy: number | null;
  approvedAt: string | null;
  executedRef: Record<string, unknown> | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface ActionOutcome {
  actionId: number;
  baseline: Record<string, unknown> | null;
  actual: Record<string, unknown> | null;
  accuracy: number | null;
  hit: number | boolean | null;
  verifiedAt: string | null;
}

export const insightsApi = {
  signals: (storeId: number, status?: string) =>
    api<{ storeId: number; signals: OperationalSignal[] }>(
      `/stores/${storeId}/insights/signals${status ? `?status=${status}` : ''}`,
    ),
  actions: (storeId: number, status?: string) =>
    api<{ storeId: number; actions: PrescriptiveAction[] }>(
      `/stores/${storeId}/insights/actions${status ? `?status=${status}` : ''}`,
    ),
  generate: (storeId: number) =>
    api<{ storeId: number; signals: number; actions: number }>(
      `/stores/${storeId}/insights/generate`,
      { method: 'POST' },
    ),
  approve: (storeId: number, id: number, body?: { percent?: number; durationHours?: number }) =>
    api<{ ok: true; action: PrescriptiveAction }>(
      `/stores/${storeId}/insights/actions/${id}/approve`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    ),
  reject: (storeId: number, id: number, reason: string) =>
    api<{ ok: true }>(`/stores/${storeId}/insights/actions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  outcome: (storeId: number, id: number) =>
    api<{ actionId: number; outcome: ActionOutcome }>(
      `/stores/${storeId}/insights/actions/${id}/outcome`,
    ),
};
