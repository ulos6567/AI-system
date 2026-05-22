import { defineStore } from 'pinia';
import { ref } from 'vue';
import { pricingApi, type PricingRule, type PricingEvent, type RuleInput } from '@/api/pricing';

export const usePricingStore = defineStore('pricing', () => {
  const rules = ref<PricingRule[]>([]);
  const events = ref<PricingEvent[]>([]);
  const loading = ref(false);
  const lastError = ref<string | null>(null);
  const lastEvaluation = ref<{ ruleId: number; applied: number; ts: string } | null>(null);

  async function refreshRules(storeId?: number): Promise<void> {
    loading.value = true;
    try {
      const r = await pricingApi.listRules(storeId);
      rules.value = r.rules;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function refreshEvents(storeId: number): Promise<void> {
    try {
      const r = await pricingApi.events(storeId);
      events.value = r.events;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function createRule(input: RuleInput): Promise<number> {
    const r = await pricingApi.createRule(input);
    await refreshRules(input.storeId ?? undefined);
    return r.id;
  }

  async function updateRule(id: number, input: Partial<RuleInput>): Promise<void> {
    await pricingApi.updateRule(id, input);
    await refreshRules();
  }

  async function deleteRule(id: number): Promise<void> {
    await pricingApi.deleteRule(id);
    await refreshRules();
  }

  async function evaluate(id: number, storeId?: number): Promise<number> {
    const r = await pricingApi.evaluateRule(id, storeId);
    lastEvaluation.value = { ruleId: id, applied: r.applied, ts: new Date().toISOString() };
    return r.applied;
  }

  return { rules, events, loading, lastError, lastEvaluation, refreshRules, refreshEvents, createRule, updateRule, deleteRule, evaluate };
});
