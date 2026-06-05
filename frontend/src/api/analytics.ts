import { api } from './client';

export interface HeatmapCell {
  zoneCode: string;
  zoneLabel: string;
  row: number;
  col: number;
  dwellWeight: number;
  intensity: number;
  passCount: number;
  pickupCount: number;
}

export interface BehaviorZone {
  zoneCode: string;
  zoneLabel: string;
  passCount: number;
  pickupCount: number;
  putbackCount: number;
  pickupRate: number;
  conversionRate: number;
  demoSegment: { ageBands: Record<string, number>; gender: Record<string, number> } | null;
}

export interface PlacementSuggestion {
  zoneCode: string;
  zoneLabel: string;
  type: 'low_conversion' | 'high_traffic_low_pickup' | 'hot_zone';
  message: string;
}

export const analyticsApi = {
  heatmap: (storeId: number) =>
    api<{ storeId: number; date: string; cells: HeatmapCell[] }>(`/stores/${storeId}/analytics/heatmap`),
  insights: (storeId: number) =>
    api<{ storeId: number; zones: BehaviorZone[] }>(`/stores/${storeId}/analytics/insights`),
  suggestions: (storeId: number) =>
    api<{ storeId: number; suggestions: PlacementSuggestion[] }>(`/stores/${storeId}/analytics/suggestions`),
  rebuild: (storeId: number) =>
    api<{ ok: true; zones: number }>(`/stores/${storeId}/analytics/rebuild`, { method: 'POST' }),
};
