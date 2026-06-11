import { api } from './client';

export type EventType = 'festival' | 'exam' | 'vacation' | 'entrance' | 'orientation';
export type EventStatus = 'active' | 'upcoming' | 'past';
export type TrafficLevel = 'low' | 'normal' | 'high' | 'peak';

export interface CampusEvent {
  id: number;
  universityId: number;
  universityName: string;
  universityShortName: string | null;
  distanceKm: number | null;
  eventType: EventType;
  title: string;
  startDate: string;
  endDate: string;
  curfewTime: string | null;
  peakHours: string | null;
  trafficLevel: TrafficLevel;
  note: string | null;
  status: EventStatus;
  daysUntilStart: number;
  daysUntilEnd: number;
}

export interface UniversitySummary {
  id: number;
  name: string;
  shortName: string | null;
  region: string | null;
  distanceKm: number | null;
  studentCount: number | null;
  activeFestival: boolean;
  activeExam: boolean;
  onVacation: boolean;
  statusLabel: '축제 진행중' | '시험기간' | '방학' | '평시';
  events: CampusEvent[];
}

export interface InventoryTarget {
  inventoryId: number;
  productMasterId: number;
  productName: string;
  category: string;
  currentQty: number;
  suggestedQty: number;
  deltaQty: number;
}

export interface CampusPlay {
  eventId: number;
  universityName: string;
  universityShortName: string | null;
  eventType: EventType;
  title: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  daysUntilStart: number;
  curfewTime: string | null;
  peakHours: string | null;
  trafficLevel: TrafficLevel;
  headline: string;
  promotion: {
    label: string;
    discountPct: number;
    categories: string[];
    window: string;
  } | null;
  inventoryTargets: InventoryTarget[];
}

export interface CalendarResponse {
  storeId: number;
  summary: { total: number; activeFestival: number; activeExam: number; upcoming: number };
  events: CampusEvent[];
}

export interface PromotePayload {
  academicEventId: number;
  label: string;
  categories: string[];
  discountPct: number;
  startDate: string;
  endDate: string;
}

export interface InventoryAdjustPayload {
  reason?: string;
  academicEventId?: number;
  adjustments: Array<{ inventoryId: number; quantity: number }>;
}

export const campusApi = {
  universities(storeId: number) {
    return api<{ storeId: number; universities: UniversitySummary[] }>(
      `/stores/${storeId}/campus/universities`,
    );
  },
  calendar(storeId: number) {
    return api<CalendarResponse>(`/stores/${storeId}/campus/calendar`);
  },
  recommendations(storeId: number) {
    return api<{ storeId: number; plays: CampusPlay[] }>(`/stores/${storeId}/campus/recommendations`);
  },
  promote(storeId: number, payload: PromotePayload) {
    return api<{ ok: boolean; eventLogId: number; promotion: PromotePayload }>(
      `/stores/${storeId}/campus/promote`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },
  adjustInventory(storeId: number, payload: InventoryAdjustPayload) {
    return api<{ ok: boolean; updated: number }>(`/stores/${storeId}/campus/inventory`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
