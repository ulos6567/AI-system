import { defineStore } from 'pinia';
import { ref } from 'vue';
import { anomaliesApi, type AnomalyEvent } from '@/api/anomalies';

export const useAnomaliesStore = defineStore('anomalies', () => {
  const items = ref<AnomalyEvent[]>([]);
  const sla = ref<{ count: number; maxDelaySec: number } | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  async function refresh(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const [list, s] = await Promise.all([anomaliesApi.list(storeId, { limit: 100 }), anomaliesApi.sla(storeId)]);
      items.value = list.anomalies;
      sla.value = s.sla;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function simulate(storeId: number): Promise<void> {
    try {
      await anomaliesApi.simulate(storeId);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function feedback(
    storeId: number,
    id: number,
    body: { falsePositive?: boolean; resolution?: string },
  ): Promise<void> {
    try {
      await anomaliesApi.feedback(storeId, id, body);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  return { items, sla, loading, lastError, refresh, simulate, feedback };
});
