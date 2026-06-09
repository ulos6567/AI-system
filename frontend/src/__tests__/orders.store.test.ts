/**
 * T072 — orders store 단위 테스트
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@/api/orders', () => ({
  ordersApi: {
    forecasts: vi.fn(async () => ({ storeId: 1, targetDate: '2026-05-23', forecasts: [] })),
    generateForecasts: vi.fn(async () => ({ storeId: 1, targetDate: '2026-05-23', generated: 0, forecasts: [] })),
    list: vi.fn(async () => ({ storeId: 1, orders: [] })),
    autoGenerate: vi.fn(async () => ({
      purchaseOrderId: 7, status: 'approved', autoHoldReason: null, items: [], targetDate: '2026-05-23',
    })),
    approve: vi.fn(async () => ({ ok: true, id: 7, status: 'sent' })),
    cancel: vi.fn(async () => ({ ok: true, id: 7, status: 'cancelled' })),
  },
}));

import { useOrdersStore } from '@/stores/orders';

describe('orders store', () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it('generateAuto sets lastResult', async () => {
    const s = useOrdersStore();
    await s.generateAuto(1, '2026-05-23');
    expect(s.lastResult?.purchaseOrderId).toBe(7);
    expect(s.lastResult?.status).toBe('approved');
  });

  it('refreshForecasts loads from GET without calling generate (server read-through)', async () => {
    const { ordersApi } = await import('@/api/orders');
    (ordersApi.generateForecasts as any).mockClear();
    const s = useOrdersStore();
    await s.refreshForecasts(1, '2026-05-23');
    // GET 이 서버 측 read-through 로 항상 데이터를 돌려주므로 클라이언트 generate 호출은 없어야 한다.
    expect(ordersApi.generateForecasts).not.toHaveBeenCalled();
    expect(s.forecasts).toEqual([]);
  });
});
