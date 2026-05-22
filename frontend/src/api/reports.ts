import { api } from './client';

export interface DailyKpiRow {
  storeId: number;
  metricDate: string;
  revenue: number;
  transactionsCount: number;
  avgTicket: number;
  discardAmount: number;
  discardRate: number;
  laborCost: number | null;
  forecastMape: number | null;
}

export interface ReportDailyResponse {
  storeId: number;
  from: string;
  to: string;
  summary: {
    revenue: number;
    transactionsCount: number;
    avgTicket: number;
    discardAmount: number;
    discardRate: number;
    avgMape: number | null;
  };
  series: DailyKpiRow[];
}

export const reportsApi = {
  daily(storeId: number, from?: string, to?: string) {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return api<ReportDailyResponse>(`/stores/${storeId}/reports/daily${qs ? `?${qs}` : ''}`);
  },
  backfill(storeId: number, from: string, to: string) {
    return api<{ storeId: number; generated: number; series: DailyKpiRow[] }>(
      `/stores/${storeId}/reports/backfill`,
      { method: 'POST', body: JSON.stringify({ from, to }) },
    );
  },
};
