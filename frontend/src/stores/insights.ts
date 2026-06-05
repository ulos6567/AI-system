import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  insightsApi,
  type PrescriptiveAction,
  type OperationalSignal,
  type ActionOutcome,
} from '@/api/insights';

export const useInsightsStore = defineStore('insights', () => {
  const actions = ref<PrescriptiveAction[]>([]);
  const signals = ref<OperationalSignal[]>([]);
  const outcomes = ref<Record<number, ActionOutcome>>({});
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  async function refresh(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const [a, s] = await Promise.all([insightsApi.actions(storeId), insightsApi.signals(storeId)]);
      actions.value = a.actions;
      signals.value = s.signals;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function generate(storeId: number): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      await insightsApi.generate(storeId);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function approve(
    storeId: number,
    id: number,
    body?: { percent?: number; durationHours?: number },
  ): Promise<void> {
    try {
      await insightsApi.approve(storeId, id, body);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function reject(storeId: number, id: number, reason: string): Promise<void> {
    try {
      await insightsApi.reject(storeId, id, reason);
      await refresh(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function loadOutcome(storeId: number, id: number): Promise<void> {
    try {
      const r = await insightsApi.outcome(storeId, id);
      outcomes.value = { ...outcomes.value, [id]: r.outcome };
    } catch {
      /* 검증 전이면 404 — 무시 */
    }
  }

  return { actions, signals, outcomes, loading, lastError, refresh, generate, approve, reject, loadOutcome };
});
