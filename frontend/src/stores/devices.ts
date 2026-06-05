import { defineStore } from 'pinia';
import { ref } from 'vue';
import { devicesApi, type DeviceRow, type DeviceHealth } from '@/api/devices';

export const useDevicesStore = defineStore('devices', () => {
  const items = ref<DeviceRow[]>([]);
  const health = ref<Record<number, DeviceHealth>>({});
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  async function refresh(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const r = await devicesApi.list(storeId);
      items.value = r.devices;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function loadHealth(storeId: number, id: number): Promise<void> {
    try {
      health.value = { ...health.value, [id]: await devicesApi.health(storeId, id) };
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function poll(storeId: number): Promise<void> {
    try {
      await devicesApi.poll(storeId);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function ackAlert(storeId: number, deviceId: number, alertId: number): Promise<void> {
    try {
      await devicesApi.ackAlert(storeId, alertId);
      await Promise.all([refresh(storeId), loadHealth(storeId, deviceId)]);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  return { items, health, loading, lastError, refresh, loadHealth, poll, ackAlert };
});
