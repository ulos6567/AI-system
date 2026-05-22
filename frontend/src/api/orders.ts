import { api } from './client';

export interface ForecastRow {
  productMasterId: number;
  productName: string;
  category: string;
  targetDate: string;
  predictedQuantity: number;
  confidence: number;
  modelVersion: string;
  generatedAt: string;
}

export interface OrderSummary {
  id: number;
  orderDate: string;
  status: 'draft' | 'pending_review' | 'approved' | 'sent' | 'received' | 'cancelled' | 'failed';
  source: 'auto' | 'manual';
  autoHoldReason: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  itemCount: number;
}

export interface OrderItem {
  id: number;
  productMasterId: number;
  productName: string;
  category: string;
  orderedQuantity: number;
  receivedQuantity: number | null;
}

export interface OrderDetail {
  order: OrderSummary & { storeId: number };
  items: OrderItem[];
}

export const ordersApi = {
  list(storeId: number, status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return api<{ storeId: number; orders: OrderSummary[] }>(`/stores/${storeId}/orders${q}`);
  },
  detail(storeId: number, id: number) {
    return api<OrderDetail>(`/stores/${storeId}/orders/${id}`);
  },
  autoGenerate(storeId: number, date?: string) {
    return api<{
      purchaseOrderId: number;
      status: string;
      autoHoldReason: string | null;
      items: Array<{
        productMasterId: number;
        productName: string;
        predictedQuantity: number;
        currentStock: number;
        orderedQuantity: number;
        pastAvgOrdered: number;
      }>;
      targetDate: string;
    }>(`/stores/${storeId}/orders/auto-generate`, {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
  },
  approve(storeId: number, id: number) {
    return api<{ ok: true; id: number; status: string }>(`/stores/${storeId}/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
  },
  cancel(storeId: number, id: number) {
    return api<{ ok: true; id: number; status: string }>(`/stores/${storeId}/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    });
  },
  updateQuantities(storeId: number, id: number, items: Array<{ id: number; orderedQuantity: number }>) {
    return api<{ ok: true; id: number; updated: number }>(`/stores/${storeId}/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'update_quantity', items }),
    });
  },
  forecasts(storeId: number, date?: string) {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return api<{ storeId: number; targetDate: string; forecasts: ForecastRow[] }>(
      `/stores/${storeId}/forecasts${q}`,
    );
  },
  generateForecasts(storeId: number, date?: string) {
    return api<{ storeId: number; targetDate: string; generated: number; forecasts: ForecastRow[] }>(
      `/stores/${storeId}/forecasts/generate`,
      { method: 'POST', body: JSON.stringify({ date }) },
    );
  },
};
