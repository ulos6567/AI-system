import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  schedulesApi,
  type ScheduleSummary,
  type ScheduleDetail,
} from '@/api/schedules';

export const useSchedulesStore = defineStore('schedules', () => {
  const items = ref<ScheduleSummary[]>([]);
  const current = ref<ScheduleDetail | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  async function refresh(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const r = await schedulesApi.list(storeId);
      items.value = r.schedules;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function open(storeId: number, id: number): Promise<void> {
    try {
      current.value = (await schedulesApi.get(storeId, id)).schedule;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function generate(storeId: number, weekStart: string): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      current.value = (await schedulesApi.generate(storeId, weekStart)).schedule;
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function confirm(storeId: number, id: number): Promise<void> {
    try {
      current.value = (await schedulesApi.confirm(storeId, id)).schedule;
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  return { items, current, loading, lastError, refresh, open, generate, confirm };
});
