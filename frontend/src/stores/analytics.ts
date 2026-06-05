import { defineStore } from 'pinia';
import { ref } from 'vue';
import { analyticsApi, type HeatmapCell, type BehaviorZone, type PlacementSuggestion } from '@/api/analytics';

export const useAnalyticsStore = defineStore('analytics', () => {
  const cells = ref<HeatmapCell[]>([]);
  const zones = ref<BehaviorZone[]>([]);
  const suggestions = ref<PlacementSuggestion[]>([]);
  const date = ref<string | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  async function refresh(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const [h, i, s] = await Promise.all([
        analyticsApi.heatmap(storeId),
        analyticsApi.insights(storeId),
        analyticsApi.suggestions(storeId),
      ]);
      cells.value = h.cells;
      date.value = h.date;
      zones.value = i.zones;
      suggestions.value = s.suggestions;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function rebuild(storeId: number): Promise<void> {
    try {
      await analyticsApi.rebuild(storeId);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  return { cells, zones, suggestions, date, loading, lastError, refresh, rebuild };
});
