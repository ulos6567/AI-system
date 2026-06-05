import { api } from './client';

export interface DeviceRow {
  id: number;
  storeId: number;
  deviceType: 'fridge' | 'showcase' | 'freezer' | 'hvac';
  label: string;
  status: 'normal' | 'warning' | 'critical' | 'offline';
  latestTemp: number | null;
  latestPower: number | null;
  latestAt: string | null;
  openAlerts: number;
}

export interface DeviceReading {
  readingAt: string;
  temperature: number | null;
  powerWatt: number | null;
}

export interface MaintenanceAlert {
  id: number;
  riskLevel: 'info' | 'warning' | 'critical';
  predictedFailureAt: string | null;
  recommendedAction: string | null;
  raisedAt: string;
  acknowledgedAt: string | null;
}

export interface DeviceHealth {
  device: { id: number; storeId: number; deviceType: string; label: string; status: string; spec: any };
  readings: DeviceReading[];
  alerts: MaintenanceAlert[];
}

export const devicesApi = {
  list: (storeId: number) =>
    api<{ storeId: number; devices: DeviceRow[] }>(`/stores/${storeId}/devices`),
  health: (storeId: number, id: number) =>
    api<DeviceHealth>(`/stores/${storeId}/devices/${id}/health`),
  poll: (storeId: number) =>
    api<{ ok: true; ingested: number; devices: number; alerts: number }>(
      `/stores/${storeId}/devices/poll`,
      { method: 'POST' },
    ),
  ackAlert: (storeId: number, id: number) =>
    api<{ ok: true }>(`/stores/${storeId}/devices/alerts/${id}/ack`, { method: 'POST' }),
};
