<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePricingStore } from '@/stores/pricing';

const auth = useAuthStore();
const pricing = usePricingStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

onMounted(() => pricing.refreshEvents(storeId.value));

function pct(orig: number, adj: number): number {
  if (orig <= 0) return 0;
  return Math.round(((orig - adj) / orig) * 100);
}
function eslColor(s: string): string {
  return s === 'sent' ? 'ok' : s === 'failed' ? 'bad' : 'pending';
}
</script>

<template>
  <div class="pricing-events-view">
    <header class="page-header">
      <div>
        <h2>가격 변동 이력</h2>
        <p class="subtitle">점포 #{{ storeId }} · {{ pricing.events.length }}건</p>
      </div>
      <button class="ghost" @click="pricing.refreshEvents(storeId)">새로고침</button>
    </header>

    <section class="card">
      <table v-if="pricing.events.length" class="ev-table">
        <thead>
          <tr>
            <th>적용 시각</th>
            <th>상품</th>
            <th>룰</th>
            <th>트리거</th>
            <th>원가</th>
            <th>할인가</th>
            <th>할인%</th>
            <th>유효기간</th>
            <th>ESL</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in pricing.events" :key="e.id">
            <td class="muted">{{ e.createdAt.replace('T', ' ').slice(0, 16) }}</td>
            <td>
              <div class="prod">{{ e.productName }}</div>
              <div class="cat">{{ e.category }}</div>
            </td>
            <td>{{ e.ruleName }}</td>
            <td><span class="badge">{{ e.triggerType }}</span></td>
            <td class="num">₩{{ Number(e.originalPrice).toLocaleString() }}</td>
            <td class="num strong">₩{{ Number(e.adjustedPrice).toLocaleString() }}</td>
            <td class="num"><span class="pct">−{{ pct(Number(e.originalPrice), Number(e.adjustedPrice)) }}%</span></td>
            <td class="muted small">
              {{ e.effectiveFrom.replace('T', ' ').slice(5, 16) }}
              <br />
              ~ {{ e.effectiveTo.replace('T', ' ').slice(5, 16) }}
            </td>
            <td><span class="esl" :data-status="eslColor(e.eslPushStatus)">{{ e.eslPushStatus }}</span></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">아직 적용된 가격 이벤트가 없습니다.</div>
    </section>
  </div>
</template>

<style scoped>
.pricing-events-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.9rem; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); overflow-x: auto; }
.ev-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 760px; }
.ev-table th, .ev-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.ev-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.ev-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.ev-table .strong { font-weight: 700; color: #047857; }
.ev-table .muted { color: #94a3b8; }
.ev-table .small { font-size: 0.78rem; }
.prod { font-weight: 500; }
.cat { font-size: 0.75rem; color: #94a3b8; }
.badge { background: #ede9fe; color: #5b21b6; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; }
.pct { background: #dcfce7; color: #166534; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; font-weight: 600; }
.esl { padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; font-weight: 600; }
.esl[data-status="ok"] { background: #dcfce7; color: #15803d; }
.esl[data-status="bad"] { background: #fee2e2; color: #b91c1c; }
.esl[data-status="pending"] { background: #fef3c7; color: #92400e; }
.empty { padding: 1.5rem; text-align: center; color: #94a3b8; }

button.ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.45rem 0.85rem; border-radius: 6px; cursor: pointer; }
</style>
