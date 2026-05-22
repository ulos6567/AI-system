<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { inventoryApi, type InventoryResponse } from '@/api/inventory';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const nearExpiry = ref(false);
const nearExpiryDays = ref(3);
const category = ref('');
const data = ref<InventoryResponse | null>(null);
const loading = ref(false);
const lastError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  lastError.value = null;
  try {
    data.value = await inventoryApi.list(storeId.value, {
      nearExpiry: nearExpiry.value,
      nearExpiryDays: nearExpiryDays.value,
      category: category.value || undefined,
    });
  } catch (err: any) {
    lastError.value = err?.message ?? 'failed';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch([nearExpiry, nearExpiryDays, category], load);

function rowClass(item: { quantity: number; daysToExpiry: number | null }): string {
  if (item.quantity === 0) return 'row zero';
  if (item.daysToExpiry !== null && item.daysToExpiry <= 1) return 'row critical';
  if (item.daysToExpiry !== null && item.daysToExpiry <= nearExpiryDays.value) return 'row warn';
  if (item.quantity <= 5) return 'row low';
  return 'row';
}
</script>

<template>
  <div class="inventory-view">
    <header class="page-header">
      <div>
        <h2>재고 관리</h2>
        <p class="subtitle">점포 #{{ storeId }}</p>
      </div>
    </header>

    <section v-if="data" class="summary">
      <div class="metric"><span class="label">전체</span><span class="value">{{ data.summary.total }}</span></div>
      <div class="metric warn"><span class="label">유통기한 임박</span><span class="value">{{ data.summary.nearExpiry }}</span></div>
      <div class="metric warn"><span class="label">저재고</span><span class="value">{{ data.summary.lowStock }}</span></div>
      <div class="metric danger"><span class="label">결품</span><span class="value">{{ data.summary.zero }}</span></div>
    </section>

    <section class="card">
      <div class="card-header">
        <h3>필터</h3>
        <div class="filters">
          <label class="check">
            <input v-model="nearExpiry" type="checkbox" />
            유통기한 임박만
          </label>
          <label>
            임계(일)
            <input v-model.number="nearExpiryDays" type="number" min="0" max="30" :disabled="!nearExpiry" />
          </label>
          <label>
            카테고리
            <select v-model="category">
              <option value="">전체</option>
              <option value="beverage">음료</option>
              <option value="snack">스낵</option>
              <option value="lunchbox">도시락</option>
              <option value="ricesnack">김밥류</option>
              <option value="instant">즉석</option>
              <option value="frozen">냉동</option>
            </select>
          </label>
        </div>
      </div>

      <div v-if="loading" class="loading">불러오는 중…</div>
      <div v-else-if="lastError" class="error">에러: {{ lastError }}</div>
      <table v-else-if="data && data.items.length" class="inv-table">
        <thead>
          <tr>
            <th>상품</th>
            <th>카테고리</th>
            <th>매대</th>
            <th>온도</th>
            <th>재고</th>
            <th>유통기한</th>
            <th>잔여일</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in data.items" :key="it.id" :class="rowClass(it)">
            <td>{{ it.productName }}</td>
            <td><span class="cat">{{ it.category }}</span></td>
            <td class="muted">{{ it.shelfLocation ?? '—' }}</td>
            <td><span class="temp" :data-zone="it.tempZone">{{ it.tempZone }}</span></td>
            <td class="num">{{ it.quantity }}</td>
            <td>{{ it.expiresAt ? it.expiresAt.slice(0, 10) : '—' }}</td>
            <td class="num">
              <span v-if="it.daysToExpiry === null">—</span>
              <span v-else :class="{ 'days-warn': it.daysToExpiry <= nearExpiryDays }">{{ it.daysToExpiry }}일</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">조회 결과 없음.</div>
    </section>
  </div>
</template>

<style scoped>
.inventory-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.9rem; }

.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
.metric { background: #fff; padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.metric .label { font-size: 0.78rem; color: #64748b; }
.metric .value { font-size: 1.4rem; font-weight: 700; color: #0f172a; }
.metric.warn { background: #fff7ed; }
.metric.warn .value { color: #c2410c; }
.metric.danger { background: #fef2f2; }
.metric.danger .value { color: #b91c1c; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
h3 { margin: 0; font-size: 1.05rem; }

.filters { display: flex; gap: 0.85rem; align-items: center; flex-wrap: wrap; font-size: 0.85rem; color: #475569; }
.filters label { display: flex; align-items: center; gap: 0.35rem; }
.filters input[type="number"], .filters select { padding: 0.3rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; }
.check { gap: 0.4rem; }

.inv-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.inv-table th, .inv-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.inv-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.inv-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.inv-table .muted { color: #94a3b8; }

.cat { background: #f1f5f9; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; color: #475569; }
.temp { padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; }
.temp[data-zone="ambient"] { background: #f1f5f9; color: #475569; }
.temp[data-zone="chilled"] { background: #dbeafe; color: #1d4ed8; }
.temp[data-zone="frozen"]  { background: #e0f2fe; color: #075985; }

.row.warn td { background: #fffbeb; }
.row.critical td { background: #fef3c7; }
.row.zero td { background: #fee2e2; }
.row.low td { background: #f0f9ff; }
.days-warn { color: #b45309; font-weight: 600; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #94a3b8; }
.error { padding: 1rem; color: #b91c1c; }

@media (max-width: 768px) {
  .summary { grid-template-columns: repeat(2, 1fr); }
  .inv-table { font-size: 0.82rem; }
}
</style>
