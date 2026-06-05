<script setup lang="ts">
/**
 * 002 (T022) — 데이터 대시보드 (FR-007~010, SC-008)
 *   기간/카테고리 필터 + KPI 카드 + 일별 매출 차트 + 카테고리 분해 + 상위 상품(이미지 100%).
 */
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDashboardStore } from '@/stores/dashboard';
import ProductImage from '@/components/ProductImage.vue';

const auth = useAuthStore();
const dash = useDashboardStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const CATEGORY_LABEL: Record<string, string> = {
  beverage: '음료',
  snack: '스낵',
  lunchbox: '도시락',
  ricesnack: '김밥·주먹밥',
  instant: '즉석식품',
  frozen: '냉동',
  etc: '기타',
};
function catLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c;
}

const ranges = [
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
];
const activeDays = computed(() => {
  if (!dash.from || !dash.to) return 30;
  const d = (new Date(dash.to).getTime() - new Date(dash.from).getTime()) / 86400_000 + 1;
  return Math.round(d);
});

const maxSeriesRevenue = computed(() => Math.max(1, ...(dash.data?.series ?? []).map((s) => s.revenue)));
const maxCatRevenue = computed(() => Math.max(1, ...(dash.data?.categories ?? []).map((c) => c.revenue)));

function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

async function applyRange(days: number): Promise<void> {
  dash.setRange(days);
  await dash.load(storeId.value);
}
async function applyCategory(c: string | null): Promise<void> {
  dash.category = c;
  await dash.load(storeId.value);
}

onMounted(async () => {
  dash.setRange(30);
  await dash.load(storeId.value);
});
</script>

<template>
  <div class="dashboard">
    <header class="page-header">
      <div>
        <h2>운영 대시보드</h2>
        <p class="subtitle">점포 #{{ storeId }} · {{ dash.from }} ~ {{ dash.to }}</p>
      </div>
      <div class="filters">
        <div class="range-group">
          <button
            v-for="r in ranges"
            :key="r.days"
            class="range-btn"
            :class="{ active: activeDays === r.days }"
            @click="applyRange(r.days)"
          >{{ r.label }}</button>
        </div>
      </div>
    </header>

    <p v-if="dash.lastError" class="error">{{ dash.lastError }}</p>

    <!-- KPI 카드 -->
    <section class="kpi-row" v-if="dash.data">
      <div class="kpi-card">
        <span class="kpi-label">총 매출</span>
        <span class="kpi-value">{{ won(dash.data.summary.revenue) }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">거래 건수</span>
        <span class="kpi-value">{{ dash.data.summary.transactionsCount.toLocaleString('ko-KR') }}건</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">평균 객단가</span>
        <span class="kpi-value">{{ won(dash.data.summary.avgTicket) }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">폐기 수량</span>
        <span class="kpi-value">{{ dash.data.summary.discardUnits.toLocaleString('ko-KR') }}개</span>
      </div>
    </section>

    <div v-if="dash.loading" class="loading">불러오는 중…</div>

    <template v-else-if="dash.data">
      <!-- 일별 매출 차트 -->
      <section class="card">
        <div class="card-header">
          <h3>일별 매출 추이</h3>
          <span v-if="dash.category" class="chip">{{ catLabel(dash.category) }} · <a @click="applyCategory(null)">전체 보기</a></span>
        </div>
        <div v-if="dash.data.series.length === 0" class="empty">기간 내 매출 데이터가 없습니다.</div>
        <div v-else class="bar-chart">
          <div v-for="s in dash.data.series" :key="s.date" class="bar-col" :title="`${s.date}: ${won(s.revenue)}`">
            <div class="bar" :style="{ height: `${(s.revenue / maxSeriesRevenue) * 100}%` }"></div>
          </div>
        </div>
      </section>

      <div class="two-col">
        <!-- 카테고리 분해 -->
        <section class="card">
          <div class="card-header"><h3>카테고리별 매출</h3></div>
          <ul class="cat-list">
            <li
              v-for="c in dash.data.categories"
              :key="c.category"
              class="cat-row"
              :class="{ active: dash.category === c.category }"
              @click="applyCategory(dash.category === c.category ? null : c.category)"
            >
              <span class="cat-name">{{ catLabel(c.category) }}</span>
              <span class="cat-bar-wrap"><span class="cat-bar" :style="{ width: `${(c.revenue / maxCatRevenue) * 100}%` }"></span></span>
              <span class="cat-val">{{ won(c.revenue) }}</span>
            </li>
          </ul>
        </section>

        <!-- 상위 상품 (이미지 100%) -->
        <section class="card">
          <div class="card-header"><h3>판매 상위 상품</h3></div>
          <ul class="top-list">
            <li v-for="(p, i) in dash.data.topProducts" :key="p.productId" class="top-row">
              <span class="rank">{{ i + 1 }}</span>
              <ProductImage :url="p.image.imageUrl" :category="p.category" :name="p.name" :size="44" />
              <div class="top-info">
                <span class="top-name">{{ p.name }}</span>
                <span class="top-meta">{{ p.units.toLocaleString('ko-KR') }}개 · {{ won(p.revenue) }}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; }
.subtitle { color: #6b7280; font-size: 0.9rem; margin: 0.2rem 0 0; }
.range-group { display: inline-flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
.range-btn { background: #fff; border: none; padding: 0.4rem 0.9rem; cursor: pointer; border-right: 1px solid #e5e7eb; }
.range-btn:last-child { border-right: none; }
.range-btn.active { background: #0ea5e9; color: #fff; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
.kpi-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
.kpi-label { color: #6b7280; font-size: 0.8rem; }
.kpi-value { font-size: 1.35rem; font-weight: 700; color: #0f172a; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; }
.chip { font-size: 0.8rem; color: #6b7280; }
.chip a { color: #2563eb; cursor: pointer; text-decoration: underline; }
.bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 160px; }
.bar-col { flex: 1; display: flex; align-items: flex-end; height: 100%; }
.bar { width: 100%; background: linear-gradient(180deg, #38bdf8, #0ea5e9); border-radius: 3px 3px 0 0; min-height: 2px; transition: height 0.2s; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.cat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.cat-row { display: grid; grid-template-columns: 5rem 1fr auto; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.2rem; border-radius: 6px; }
.cat-row:hover, .cat-row.active { background: #f1f5f9; }
.cat-name { font-size: 0.85rem; }
.cat-bar-wrap { background: #eef2f7; border-radius: 4px; height: 14px; overflow: hidden; }
.cat-bar { display: block; height: 100%; background: #6366f1; border-radius: 4px; }
.cat-val { font-size: 0.8rem; color: #475569; white-space: nowrap; }
.top-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.top-row { display: flex; align-items: center; gap: 0.6rem; }
.rank { width: 1.4rem; text-align: center; font-weight: 700; color: #94a3b8; }
.top-info { display: flex; flex-direction: column; }
.top-name { font-size: 0.88rem; font-weight: 600; }
.top-meta { font-size: 0.78rem; color: #6b7280; }
.empty, .loading { color: #9ca3af; font-size: 0.9rem; padding: 1rem 0; }
.error { color: #dc2626; }
@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .two-col { grid-template-columns: 1fr; }
}
</style>
