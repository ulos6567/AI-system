import { api } from './client';

export interface ScheduleShift {
  employeeId: number;
  employeeName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftCode?: string;
}

export interface ScheduleDetail {
  id: number;
  storeId: number;
  weekStart: string;
  status: 'draft' | 'confirmed';
  estimatedLaborCost: number;
  constraintViolations: string[];
  shifts: ScheduleShift[];
}

export interface ScheduleSummary {
  id: number;
  weekStart: string;
  status: 'draft' | 'confirmed';
  estimatedLaborCost: number;
  violationCount: number;
  shiftCount: number;
}

export const schedulesApi = {
  list: (storeId: number) =>
    api<{ storeId: number; schedules: ScheduleSummary[] }>(`/stores/${storeId}/schedules`),
  get: (storeId: number, id: number) =>
    api<{ schedule: ScheduleDetail }>(`/stores/${storeId}/schedules/${id}`),
  generate: (storeId: number, weekStart: string) =>
    api<{ schedule: ScheduleDetail }>(`/stores/${storeId}/schedules/generate`, {
      method: 'POST',
      body: JSON.stringify({ weekStart }),
    }),
  confirm: (storeId: number, id: number) =>
    api<{ ok: true; schedule: ScheduleDetail }>(`/stores/${storeId}/schedules/${id}/confirm`, {
      method: 'POST',
    }),
};
