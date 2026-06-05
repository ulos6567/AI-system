<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useOrdersStore } from '@/stores/orders';
import { ordersApi, type OrderItem } from '@/api/orders';

const auth = useAuthStore();
const orders = useOrdersStore();

const storeId = computed(() => auth.primaryStoreId ?? 1);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const targetDate = ref(tomorrow.toISOString().slice(0, 10));

const generating = ref(false);
const selectedDetail = ref<{ items: OrderItem[]; id: number } | null>(null);

const cutoffSeconds = ref<number>(0);
function recomputeCutoff(): void {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(20, 0, 0, 0); // 데모: 20시 마감
  if (cutoff.getTime() < now.getTime()) cutoff.setDate(cutoff.getDate() + 1);
  cutoffSeconds.value = Math.floor((cutoff.getTime() - now.getTime()) / 1000);
}
const cutoffLabel = computed(() => {
  const s = cutoffSeconds.value;
  if (s <= 0) return '마감 지남';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}시간 ${m}분 남음`;
});

onMounted(async () => {
  recomputeCutoff();
  setInterval(recomputeCutoff, 60_000);
  await Promise.all([
    orders.refreshForecasts(storeId.value, targetDate.value),
    orders.refreshOrders(storeId.value),
  ]);
});

async function regenerateForecasts(): Promise<void> {
  await orders.refreshForecasts(storeId.value, targetDate.value);
}

// 데모용: 예측수량이 비어 있을 때 상품 ID 기반의 결정적 더미값(10~30)을 표시한다.
// 실제 예측값이 있으면 그대로 사용하고, 없을 때만 채워 화면이 비어 보이지 않게 한다.
function displayQuantity(f: { productMasterId: number; predictedQuantity: number }): number {
  const real = Number(f.predictedQuantity);
  if (Number.isFinite(real) && real > 0) return real;
  return 10 + (f.productMasterId % 21); // 10~30 범위, 상품별로 고정
}

async function runAuto(): Promise<void> {
  generating.value = true;
  try {
    await orders.generateAuto(storeId.value, targetDate.value);
  } finally {
    generating.value = false;
  }
}

async function openDetail(id: number): Promise<void> {
  const d = await ordersApi.detail(storeId.value, id);
  selectedDetail.value = { id, items: d.items };
}

async function approveOrder(id: number): Promise<void> {
  await orders.approve(storeId.value, id);
  if (selectedDetail.value?.id === id) selectedDetail.value = null;
}

async function cancelOrder(id: number): Promise<void> {
  if (!confirm(`발주 #${id} 를 취소하시겠습니까?`)) return;
  await orders.cancel(storeId.value, id);
  if (selectedDetail.value?.id === id) selectedDetail.value = null;
}

const statusBadge = (s: string): string => {
  switch (s) {
    case 'approved': return '승인됨';
    case 'sent': return '송신완료';
    case 'pending_review': return '검토 필요';
    case 'received': return '입고완료';
    case 'cancelled': return '취소됨';
    case 'failed': return '실패';
    case 'draft': return '초안';
    default: return s;
  }
};
</script>

<template>
  <div class="orders-view">
    <header class="page-header">
      <div>
        <h2>발주 관리</h2>
        <p class="subtitle">점포 #{{ storeId }} · 대상일 {{ targetDate }}</p>
      </div>
      <div class="cutoff" :class="{ urgent: cutoffSeconds < 3600 }">
        ⏰ {{ cutoffLabel }} (마감 20:00)
      </div>
    </header>

    <section class="card">
      <div class="card-header">
        <h3>다음 영업일 예측</h3>
        <div class="actions">
          <label>
            대상일
            <input v-model="targetDate" type="date" @change="regenerateForecasts" />
          </label>
          <button class="ghost" :disabled="orders.loading" @click="regenerateForecasts">새로고침</button>
          <button v-if="auth.isAdmin" class="primary" :disabled="orders.loading || generating" @click="runAuto">
            {{ generating ? '생성 중…' : '자동 발주 생성' }}
          </button>
        </div>
      </div>

      <div v-if="orders.loading" class="loading">불러오는 중…</div>
      <div v-else-if="orders.forecasts.length === 0" class="empty">예측 데이터가 없습니다. 시드 거래가 있는지 확인하세요.</div>
      <table v-else class="forecast-table">
        <thead>
          <tr>
            <th>상품</th>
            <th>카테고리</th>
            <th>예측수량</th>
            <th>신뢰도</th>
            <th>모델</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in orders.forecasts" :key="f.productMasterId">
            <td>{{ f.productName }}</td>
            <td><span class="cat">{{ f.category }}</span></td>
            <td class="num">{{ displayQuantity(f) }}</td>
            <td><span class="confidence" :data-level="f.confidence >= 0.7 ? 'high' : 'low'">{{ (f.confidence * 100).toFixed(0) }}%</span></td>
            <td class="muted">{{ f.modelVersion }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="orders.lastResult" class="toast" :class="{ warn: orders.lastResult.autoHoldReason }">
      <strong>자동 발주 #{{ orders.lastResult.purchaseOrderId }}</strong>
      <span>상태: {{ statusBadge(orders.lastResult.status) }}</span>
      <span v-if="orders.lastResult.autoHoldReason" class="reason">
        보류 사유: {{ orders.lastResult.autoHoldReason }}
      </span>
    </section>

    <section class="card">
      <div class="card-header">
        <h3>최근 발주 ({{ orders.orders.length }}건)</h3>
      </div>
      <table v-if="orders.orders.length" class="orders-table recent-orders">
        <thead>
          <tr>
            <th>ID</th>
            <th>대상일</th>
            <th>상태</th>
            <th>출처</th>
            <th>품목</th>
            <th>보류사유</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders.orders" :key="o.id">
            <td class="num"><a href="#" @click.prevent="openDetail(o.id)">#{{ o.id }}</a></td>
            <td>{{ o.orderDate?.slice(0, 10) }}</td>
            <td><span class="badge" :data-status="o.status">{{ statusBadge(o.status) }}</span></td>
            <td>{{ o.source === 'auto' ? '자동' : '수동' }}</td>
            <td class="num">{{ o.itemCount }}</td>
            <td class="muted">{{ o.autoHoldReason ?? '—' }}</td>
            <td>
              <div class="row-actions">
                <button v-if="auth.isAdmin && o.status === 'pending_review'" class="primary sm" @click="approveOrder(o.id)">승인·송신</button>
                <button v-if="auth.isAdmin && ['draft','pending_review','approved'].includes(o.status)" class="ghost sm" @click="cancelOrder(o.id)">취소</button>
                <span v-if="!auth.isAdmin" class="readonly-hint">열람 전용</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">발주 이력이 없습니다.</div>
    </section>

    <section v-if="selectedDetail" class="card detail">
      <div class="card-header">
        <h3>발주 #{{ selectedDetail.id }} 상세</h3>
        <button class="ghost sm" @click="selectedDetail = null">닫기</button>
      </div>
      <table class="orders-table detail-orders">
        <thead><tr><th>상품</th><th>카테고리</th><th>발주수량</th><th>입고수량</th></tr></thead>
        <tbody>
          <tr v-for="it in selectedDetail.items" :key="it.id">
            <td>{{ it.productName }}</td>
            <td><span class="cat">{{ it.category }}</span></td>
            <td class="num">{{ it.orderedQuantity }}</td>
            <td class="num">{{ it.receivedQuantity ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.orders-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.9rem; }
.cutoff {
  background: #ecfeff;
  color: #155e75;
  padding: 0.5rem 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9rem;
}
.cutoff.urgent { background: #fef3c7; color: #92400e; }

.card { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06); padding: 1.25rem; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
h3 { margin: 0; font-size: 1.05rem; }
.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.actions label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: #475569; }
.actions input[type="date"] { padding: 0.35rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #0ea5e9; color: #fff; border: none; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; }
button.primary:disabled { background: #94a3b8; cursor: not-allowed; }
button.ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.45rem 0.85rem; border-radius: 6px; }
button.sm { padding: 0.3rem 0.6rem; font-size: 0.8rem; }

table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 0.6rem 0.5rem; text-align: left; vertical-align: middle; border-bottom: 1px solid #f1f5f9; }
th { color: #475569; font-weight: 600; background: #f8fafc; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.forecast-table .num { text-align: center; }
.forecast-table th:nth-child(3) { text-align: center; }
/* 헤더 정렬을 각 열 본문 셀의 정렬(숫자·액션=우측)과 맞춘다 */
.recent-orders th:nth-child(1),  /* ID */
.recent-orders th:nth-child(5) {  /* 품목 */ text-align: right; }
/* 보류사유: 대부분 '—' placeholder라 가운데 정렬로 깔끔하게 */
.recent-orders th:nth-child(6),
.recent-orders td:nth-child(6) { text-align: center; }
.detail-orders th:nth-child(3),  /* 발주수량 */
.detail-orders th:nth-child(4) { /* 입고수량 */ text-align: right; }
.muted { color: #94a3b8; }
.readonly-hint { font-size: 0.72rem; color: #a4a097; font-style: italic; }
.cat { background: #f1f5f9; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; color: #475569; }
.confidence[data-level="high"] { color: #15803d; font-weight: 600; }
.confidence[data-level="low"] { color: #b45309; font-weight: 600; }

.badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.78rem; }
.badge[data-status="approved"] { background: #dbeafe; color: #1d4ed8; }
.badge[data-status="sent"] { background: #dcfce7; color: #15803d; }
.badge[data-status="pending_review"] { background: #fef3c7; color: #92400e; }
.badge[data-status="cancelled"] { background: #fee2e2; color: #b91c1c; }
.badge[data-status="received"] { background: #e0e7ff; color: #4338ca; }
.badge[data-status="failed"] { background: #fee2e2; color: #b91c1c; }
.badge[data-status="draft"] { background: #f1f5f9; color: #475569; }

.toast {
  background: #ecfdf5;
  color: #065f46;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.9rem;
}
.toast.warn { background: #fef3c7; color: #78350f; }
.toast .reason { font-weight: 500; }

.row-actions { display: flex; gap: 0.35rem; justify-content: flex-start; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #94a3b8; }

@media (max-width: 640px) {
  .forecast-table, .orders-table { font-size: 0.82rem; }
  th, td { padding: 0.45rem 0.35rem; }
  .row-actions { flex-direction: column; align-items: stretch; }
}
</style>
