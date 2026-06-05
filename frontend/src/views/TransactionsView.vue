<script setup lang="ts">
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue';
import {
  Chart,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { useAuthStore } from '@/stores/auth';
import { transactionsApi, type SeriesPoint, type TransactionRow } from '@/api/transactions';

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
);

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const today = new Date();
const fmt = (d: Date) => d.toISOString().slice(0, 10);

const from = ref(fmt(new Date(today.getTime() - 30 * 86400_000)));
const to = ref(fmt(new Date(today.getTime() + 86400_000)));
const aggregate = ref<'daily' | 'weekly' | 'monthly'>('daily');

const series = ref<SeriesPoint[]>([]);
const recent = ref<TransactionRow[]>([]);
const loading = ref(false);

const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [s, r] = await Promise.all([
      transactionsApi.series(storeId.value, aggregate.value, from.value, to.value),
      transactionsApi.list(storeId.value, { from: from.value, to: to.value }),
    ]);
    series.value = s.series;
    recent.value = r.transactions;
    renderChart();
  } finally {
    loading.value = false;
  }
}

// ISO 날짜 문자열(예: 2026-05-05T00:00:00.000Z)을 MM-DD(예: 05-05)로 변환.
// UTC 자정 버킷이므로 문자열에서 직접 추출해 타임존 변환에 따른 날짜 밀림을 방지한다.
function formatBucket(bucket: string): string {
  const m = /^\d{4}-(\d{2}-\d{2})/.exec(bucket);
  return m ? m[1] : bucket;
}

function renderChart(): void {
  if (!chartCanvas.value) return;
  chart?.destroy();
  chart = new Chart(chartCanvas.value, {
    type: 'bar',
    data: {
      labels: series.value.map((p) => formatBucket(p.bucket)),
      datasets: [
        {
          type: 'bar',
          label: '매출(₩)',
          data: series.value.map((p) => Number(p.revenue)),
          backgroundColor: 'rgba(14, 165, 233, 0.7)',
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: '거래 건수',
          data: series.value.map((p) => Number(p.txCount)),
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '매출(₩)' },
          ticks: { callback: (v) => `${Number(v).toLocaleString()}` },
        },
        y1: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: '건수' },
        },
      },
    },
  });
}

onMounted(load);
onBeforeUnmount(() => chart?.destroy());
watch([from, to, aggregate], load);

const totalRevenue = computed(() => series.value.reduce((s, p) => s + Number(p.revenue), 0));
const totalTx = computed(() => series.value.reduce((s, p) => s + Number(p.txCount), 0));
const avgTicket = computed(() => totalTx.value ? totalRevenue.value / totalTx.value : 0);
</script>

<template>
  <div class="tx-view">
    <header class="page-header">
      <div>
        <h2>매출 현황</h2>
        <p class="subtitle">점포 #{{ storeId }} · {{ from }} ~ {{ to }}</p>
      </div>
    </header>

    <section class="metrics">
      <div class="metric"><span class="label">총 매출</span><span class="value">₩{{ totalRevenue.toLocaleString() }}</span></div>
      <div class="metric"><span class="label">거래 건수</span><span class="value">{{ totalTx.toLocaleString() }}</span></div>
      <div class="metric"><span class="label">평균 객단가</span><span class="value">₩{{ Math.round(avgTicket).toLocaleString() }}</span></div>
    </section>

    <section class="card">
      <div class="card-header">
        <h3>매출 차트</h3>
        <div class="filters">
          <label>From <input v-model="from" type="date" /></label>
          <label>To <input v-model="to" type="date" /></label>
          <label>
            집계
            <select v-model="aggregate">
              <option value="daily">일별</option>
              <option value="weekly">주별</option>
              <option value="monthly">월별</option>
            </select>
          </label>
        </div>
      </div>
      <div class="chart-wrap">
        <canvas ref="chartCanvas"></canvas>
      </div>
      <div v-if="loading" class="loading">불러오는 중…</div>
    </section>

    <section class="card">
      <div class="card-header">
        <h3>최근 거래 ({{ recent.length }}건)</h3>
      </div>
      <table v-if="recent.length" class="tx-table">
        <thead>
          <tr><th>일시</th><th>출처</th><th>결제</th><th>품목수</th><th>총액</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in recent" :key="t.id">
            <td>{{ t.occurredAt.replace('T', ' ').slice(0, 16) }}</td>
            <td><span class="src">{{ t.posSource }}</span></td>
            <td class="muted">{{ t.paymentMethod ?? '—' }}</td>
            <td class="num">{{ t.itemCount }}</td>
            <td class="num">₩{{ Number(t.totalAmount).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">거래 없음.</div>
    </section>
  </div>
</template>

<style scoped>
.tx-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748d; font-size: 0.9rem; }

.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.metric { background: #fff; padding: 1rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(15,23,42,0.06); display: flex; flex-direction: column; gap: 0.25rem; }
.metric .label { font-size: 0.78rem; color: #64748d; }
.metric .value { font-size: 1.3rem; font-weight: 700; color: #0d253d; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
h3 { margin: 0; font-size: 1.05rem; }
.filters { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; font-size: 0.85rem; }
.filters input, .filters select { padding: 0.3rem 0.5rem; border: 1px solid #c7d2e0; border-radius: 4px; }

.chart-wrap { position: relative; height: 320px; }

.tx-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.tx-table th, .tx-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #eef3f8; }
.tx-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.tx-table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* 숫자 열(품목수·총액) 헤더를 우측 정렬된 값과 맞춤 */
.tx-table th:nth-child(4),
.tx-table th:nth-child(5) { text-align: right; }
.tx-table .muted { color: #8a99af; }
.src { background: #ebe9fe; color: #2e2b8c; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; }

.loading, .empty { padding: 1rem; text-align: center; color: #8a99af; }

@media (max-width: 768px) {
  .metrics { grid-template-columns: repeat(3, 1fr); }
  .chart-wrap { height: 260px; }
  .tx-table { font-size: 0.82rem; }
}
@media (max-width: 480px) {
  .metrics { grid-template-columns: 1fr; }
}
</style>
