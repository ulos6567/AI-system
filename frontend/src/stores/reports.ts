import { defineStore } from 'pinia';
import { ref } from 'vue';
import { reportsApi, type ReportDailyResponse, type DailyKpiRow } from '@/api/reports';

export const useReportsStore = defineStore('reports', () => {
  const current = ref<ReportDailyResponse | null>(null);
  const compare = ref<ReportDailyResponse | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  async function load(storeId: number, from: string, to: string): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      current.value = await reportsApi.daily(storeId, from, to);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function loadCompare(storeId: number, from: string, to: string): Promise<void> {
    try {
      compare.value = await reportsApi.daily(storeId, from, to);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function backfill(storeId: number, from: string, to: string): Promise<DailyKpiRow[]> {
    const r = await reportsApi.backfill(storeId, from, to);
    return r.series;
  }

  function clearCompare(): void { compare.value = null; }

  return { current, compare, loading, lastError, load, loadCompare, backfill, clearCompare };
});
