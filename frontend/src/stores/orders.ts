import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ordersApi, type ForecastRow, type OrderSummary } from '@/api/orders';

export const useOrdersStore = defineStore('orders', () => {
  const forecasts = ref<ForecastRow[]>([]);
  const orders = ref<OrderSummary[]>([]);
  const loading = ref(false);
  const lastError = ref<string | null>(null);
  const lastResult = ref<{ purchaseOrderId: number; status: string; autoHoldReason: string | null; targetDate: string } | null>(null);

  async function refreshForecasts(storeId: number, date?: string): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const r = await ordersApi.forecasts(storeId, date);
      if (r.forecasts.length === 0) {
        const g = await ordersApi.generateForecasts(storeId, date);
        forecasts.value = g.forecasts;
      } else {
        forecasts.value = r.forecasts;
      }
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
