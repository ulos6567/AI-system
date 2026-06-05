import { api } from './client';

export interface ResolvedImage {
  productId: number;
  imageUrl: string;
  isFallback: boolean;
  source: 'real' | 'category' | 'generated';
}

export interface DashboardResponse {
  storeId: number;
  from: string;
  to: string;
  category: string | null;
  summary: {
    revenue: number;
    transactionsCount: number;
    avgTicket: number;
    units: number;
    discardUnits: number;
  };
  series: { date: string; revenue: number; units: number }[];
  categories: { category: string; revenue: number; units: number }[];
  topProducts: {
    productId: number;
    name: string;
    category: string | null;
    units: number;
    revenue: number;
    image: ResolvedImage;
  }[];
}

export const dashboardApi = {
  get(storeId: number, opts: { from?: string; to?: string; category?: string } = {}) {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.category) q.set('category', opts.category);
    const qs = q.toString();
    return api<DashboardResponse>(`/stores/${storeId}/dashboard${qs ? `?${qs}` : ''}`);
  },
};
