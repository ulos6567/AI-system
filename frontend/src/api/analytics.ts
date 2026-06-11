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

export interface ImpulseCategoryStat {
  key: string;
  label: string;
  touches: number;
  buys: number;
  conversionRate: number;
  upliftPct: number;
  recommended: boolean;
}
export interface ImpulseSegment {
  dow: number;
  dowLabel: string;
  bucket: string;
  traffic: number;
  avgWaitSec: number;
  longWait: boolean;
  topCategories: { label: string; touches: number; conversionRate: number; upliftPct: number }[];
}
export interface ImpulseRecommendation {
  segmentLabel: string;
  items: string[];
  upliftPct: number;
  message: string;
}
export interface ImpulseZoneReport {
  zone: { code: string; label: string };
  waitThresholdSec: number;
  avgWaitSec: number;
  categories: ImpulseCategoryStat[];
  segments: ImpulseSegment[];
  recommendations: ImpulseRecommendation[];
}

export const analyticsApi = {
  heatmap: (storeId: number) =>
    api<{ storeId: number; date: string; cells: HeatmapCell[] }>(`/stores/${storeId}/analytics/heatmap`),
  impulse: (storeId: number) =>
    api<{ storeId: number } & ImpulseZoneReport>(`/stores/${storeId}/analytics/impulse`),
  insights: (storeId: number) =>
    api<{ storeId: number; zones: BehaviorZone[] }>(`/stores/${storeId}/analytics/insights`),
  suggestions: (storeId: number) =>
    api<{ storeId: number; suggestions: PlacementSuggestion[] }>(`/stores/${storeId}/analytics/suggestions`),
  rebuild: (storeId: number) =>
    api<{ ok: true; zones: number }>(`/stores/${storeId}/analytics/rebuild`, { method: 'POST' }),
};
