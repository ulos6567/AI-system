import { api } from './client';

export type Shift = 'open' | 'mid' | 'close';

export interface CashStatus {
  lastCountedAt: string | null;
  openingFloat: number;
  cashSales: number;
  cashTxCount: number;
  expectedAmount: number;
  sinceLabel: string;
}

export interface CashCountRow {
  id: number;
  countedAt: string;
  shift: Shift;
  openingFloat: number;
  cashSales: number;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  denominations: Record<string, number> | null;
  memo: string | null;
  userName: string | null;
}

export interface CashOverview {
  storeId: number;
  status: CashStatus;
  counts: CashCountRow[];
}

export interface CreateCountPayload {
  shift: Shift;
  countedAmount: number;
  denominations?: Record<string, number>;
  memo?: string;
}

export const cashApi = {
  overview(storeId: number) {
    return api<CashOverview>(`/stores/${storeId}/cash`);
  },
  create(storeId: number, payload: CreateCountPayload) {
    return api<{ ok: boolean; count: CashCountRow; status: CashStatus }>(`/stores/${storeId}/cash/counts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
