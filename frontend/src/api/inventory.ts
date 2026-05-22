import { api } from './client';

export interface InventoryRow {
  id: number;
  productMasterId: number;
  productName: string;
  category: string;
  tempZone: 'ambient' | 'chilled' | 'frozen';
  shelfLifeDays: number | null;
  quantity: number;
  shelfLocation: string | null;
  expiresAt: string | null;
  daysToExpiry: number | null;
  updatedAt: string;
}

export interface InventoryResponse {
  storeId: number;
  summary: { total: number; nearExpiry: number; lowStock: number; zero: number };
  items: InventoryRow[];
}

export const inventoryApi = {
  list(storeId: number, opts: { nearExpiry?: boolean; nearExpiryDays?: number; category?: string; lowStockThreshold?: number } = {}) {
    const q = new URLSearchParams();
    if (opts.nearExpiry) q.set('nearExpiry', '1');
    if (opts.nearExpiryDays !== undefined) q.set('nearExpiryDays', String(opts.nearExpiryDays));
    if (opts.category) q.set('category', opts.category);
    if (opts.lowStockThreshold !== undefined) q.set('lowStockThreshold', String(opts.lowStockThreshold));
    const qs = q.toString();
    return api<InventoryResponse>(`/stores/${storeId}/inventory${qs ? `?${qs}` : ''}`);
  },
};
