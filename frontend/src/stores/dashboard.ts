import { defineStore } from 'pinia';
import { ref } from 'vue';
import { dashboardApi, type DashboardResponse } from '@/api/dashboard';

export const useDashboardStore = defineStore('dashboard', () => {
  const data = ref<DashboardResponse | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  // 필터 상태
  const from = ref<string | null>(null);
  const to = ref<string | null>(null);
  const category = ref<string | null>(null);

  async function load(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      data.value = await dashboardApi.get(storeId, {
        from: from.value ?? undefined,
        to: to.value ?? undefined,
        category: category.value ?? undefined,
      });
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  function setRange(days: number): void {
    const t = new Date();
    const f = new Date();
    f.setDate(f.getDate() - (days - 1));
    to.value = t.toISOString().slice(0, 10);
    from.value = f.toISOString().slice(0, 10);
  }

  return { data, loading, lastError, from, to, category, load, setRange };
});
