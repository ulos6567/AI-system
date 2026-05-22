import { api } from './client';

export interface TransactionRow {
  id: number;
  posSource: 'pos' | 'self_kiosk' | 'app';
  occurredAt: string;
  totalAmount: number;
  paymentMethod: string | null;
  itemCount: number;
}

export interface SeriesPoint {
  bucket: string;
  txCount: number;
  revenue: number;
  avgTicket: number;
}

export const transactionsApi = {
  list(storeId: number, opts: { from?: string; to?: string; posSource?: string } = {}) {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.posSource) q.set('posSource', opts.posSource);
    const qs = q.toString();
    return api<{ storeId: number; transactions: TransactionRow[] }>(
      `/stores/${storeId}/transactions${qs ? `?${qs}` : ''}`,
    );
  },
  series(storeId: number, aggregate: 'daily' | 'weekly' | 'monthly', from?: string, to?: string) {
    const q = new URLSearchParams({ aggregate });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return api<{ storeId: number; aggregate: string; series: SeriesPoint[] }>(
      `/stores/${storeId}/transactions?${q.toString()}`,
    );
  },
};
