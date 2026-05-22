import { api } from './client';

export interface LookupResult {
  localCode: string;
  localName: string;
  productMasterId: number;
  productName: string;
  category: string;
  barcode: string | null;
}

export const selfCheckoutApi = {
  lookup(storeId: number, q: string) {
    return api<{ storeId: number; q: string; results: LookupResult[]; exactMatch: boolean }>(
      `/stores/${storeId}/products/lookup?q=${encodeURIComponent(q)}`,
    );
  },
  ingest(storeId: number, payload: {
    externalId: string;
    occurredAt: string;
    posSource: 'self_kiosk' | 'app';
    totalAmount: number;
    paymentMethod?: string;
    items: Array<{ localCode: string; quantity: number; unitPrice: number }>;
  }) {
    return api<{ accepted: number; rejected: number }>(
      `/stores/${storeId}/transactions/ingest`,
      { method: 'POST', body: JSON.stringify({ transactions: [payload] }) },
    );
  },
};

export const visionApi = {
  start(storeId: number) { return api<{ ok: true; capturing: boolean }>(`/stores/${storeId}/vision/start`, { method: 'POST', body: '{}' }); },
  stop(storeId: number)  { return api<{ ok: true; capturing: boolean }>(`/stores/${storeId}/vision/stop`,  { method: 'POST', body: '{}' }); },
  status(storeId: number) { return api<{ storeId: number; capturing: boolean }>(`/stores/${storeId}/vision/status`); },
  behavior(storeId: number, limit = 50) {
    return api<{ storeId: number; events: Array<{ id: number; sessionId: string; eventType: string; zoneCode: string | null; productMasterId: number | null; productName: string | null; dwellSeconds: number | null; occurredAt: string }> }>(
      `/stores/${storeId}/analytics/behavior?limit=${limit}`,
    );
  },
  zones(storeId: number) {
    return api<{ storeId: number; zones: Array<{ zoneCode: string; events: number; dwellSeconds: number; pickups: number; uniqueSessions: number }> }>(
      `/stores/${storeId}/analytics/zones`,
    );
  },
};
