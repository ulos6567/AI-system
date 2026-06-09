import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ordersApi, type ForecastRow, type OrderSummary } from '@/api/orders';

export const useOrdersStore = defineStore('orders', () => {
  const forecasts = ref<ForecastRow[]>([]);
  const orders = ref<OrderSummary[]>([]);
  const loading = ref(false);
  const lastError = ref<string | null>(null);
  const lastResult = ref<{ purchaseOrderId: number; status: string; autoHoldReason: string | null; targetDate: string } | null>(null);

  // GET /forecasts 는 비어 있으면 서버가 즉석 생성(read-through)해 항상 데이터를 돌려준다.
  //   → 클라이언트에서 별도 generate(POST, 관리자 전용 쓰기)를 호출할 필요가 없다.
  //     (게스트가 generate 를 호출하면 401 이 발생해 강제 로그아웃되던 문제도 함께 해소)
  async function refreshForecasts(storeId: number, date?: string): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const r = await ordersApi.forecasts(storeId, date);
      forecasts.value = r.forecasts;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function refreshOrders(storeId: number): Promise<void> {
    try {
      const r = await ordersApi.list(storeId);
      orders.value = r.orders;
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    }
  }

  async function generateAuto(storeId: number, date?: string): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const r = await ordersApi.autoGenerate(storeId, date);
      lastResult.value = {
        purchaseOrderId: r.purchaseOrderId,
        status: r.status,
        autoHoldReason: r.autoHoldReason,
        targetDate: r.targetDate,
      };
      await refreshOrders(storeId);
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      loading.value = false;
    }
  }

  async function approve(storeId: number, id: number): Promise<void> {
    await ordersApi.approve(storeId, id);
    await refreshOrders(storeId);
  }

  async function cancel(storeId: number, id: number): Promise<void> {
    await ordersApi.cancel(storeId, id);
    await refreshOrders(storeId);
  }

  return {
    forecasts,
    orders,
    loading,
    lastError,
    lastResult,
    refreshForecasts,
    refreshOrders,
    generateAuto,
    approve,
    cancel,
  };
});
