import { api } from './client';

export type TriggerType = 'shelf_life' | 'weather' | 'demand_drop' | 'schedule' | 'manual';
export type ActionType = 'percent_off' | 'fixed_price' | 'bundle';

export interface PricingRule {
  id: number;
  storeId: number | null;
  name: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown> | null;
  actionType: ActionType;
  actionConfig: Record<string, unknown> | null;
  isActive: 0 | 1 | boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PricingEvent {
  id: number;
  productMasterId: number;
  productName: string;
  category: string;
  pricingRuleId: number;
  ruleName: string;
  triggerType: TriggerType;
  actionType: ActionType;
  originalPrice: number;
  adjustedPrice: number;
  effectiveFrom: string;
  effectiveTo: string;
  eslPushStatus: 'pending' | 'sent' | 'failed';
  auditMeta: unknown;
  createdAt: string;
}

export interface RuleInput {
  storeId?: number | null;
  name: string;
  triggerType: TriggerType;
  triggerConfig?: Record<string, unknown>;
  actionType: ActionType;
  actionConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export const pricingApi = {
  listRules(storeId?: number) {
    const qs = storeId ? `?storeId=${storeId}` : '';
    return api<{ rules: PricingRule[] }>(`/pricing/rules${qs}`);
  },
  createRule(rule: RuleInput) {
    return api<{ id: number; ok: true }>(`/pricing/rules`, {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  },
  updateRule(id: number, rule: Partial<RuleInput>) {
    return api<{ id: number; ok: true }>(`/pricing/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(rule),
    });
  },
  deleteRule(id: number) {
    return api<{ id: number; ok: true }>(`/pricing/rules/${id}`, { method: 'DELETE' });
  },
  evaluateRule(id: number, storeId?: number) {
    return api<{ id: number; applied: number; events: PricingEvent[] }>(
      `/pricing/rules/${id}/evaluate`,
      { method: 'POST', body: JSON.stringify({ storeId }) },
    );
  },
  events(storeId: number, limit = 100) {
    return api<{ storeId: number; events: PricingEvent[] }>(
      `/stores/${storeId}/pricing-events?limit=${limit}`,
    );
  },
};
