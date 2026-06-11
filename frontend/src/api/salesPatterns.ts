import { api } from './client';

export interface HeatCell {
  dow: number; // 1=일 ~ 7=토
  hour: number; // 0~23
  tx: number;
  revenue: number;
}
export interface PeakHeatmap {
  windowDays: number;
  cells: HeatCell[];
  maxTx: number;
  peak: { dow: number; hour: number; tx: number } | null;
  dowTotals: { dow: number; tx: number }[];
  hourTotals: { hour: number; tx: number }[];
}

export interface BasketPair {
  p1: number; p2: number;
  name1: string; name2: string;
  cat1: string; cat2: string;
  pairCount: number;
  supportPct: number;
  confidence1to2Pct: number;
  confidence2to1Pct: number;
  lift: number;
}
export interface BasketAnalysis {
  windowDays: number;
  totalBaskets: number;
  avgBasketSize: number;
  multiItemPct: number;
  pairs: BasketPair[];
}

export const salesPatternsApi = {
  heatmap: (storeId: number) =>
    api<{ storeId: number } & PeakHeatmap>(`/stores/${storeId}/sales-patterns/heatmap`),
  basket: (storeId: number) =>
    api<{ storeId: number } & BasketAnalysis>(`/stores/${storeId}/sales-patterns/basket`),
};
