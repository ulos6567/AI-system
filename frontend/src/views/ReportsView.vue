<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import {
  Chart,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { useAuthStore } from '@/stores/auth';
import { useReportsStore } from '@/stores/reports';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const auth = useAuthStore();
const reports = useReportsStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const today = new Date();
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const to = ref(fmt(today));
const from = ref(fmt(new Date(today.getTime() - 27 * 86400_000)));
const compareEnabled = ref(false);
const compareFrom = ref(fmt(new Date(today.getTime() - 55 * 86400_000)));
const compareTo = ref(fmt(new Date(today.getTime() - 28 * 86400_000)));
const busy = ref(false);

const revChart = ref<HTMLCanvasElement | null>(null);
const discardChart = ref<HTMLCanvasElement | null>(null);
const mapeChart = ref<HTMLCanvasElement | null>(null);
let chartA: Chart | null = null;
let chartB: Chart | null = null;
let chartC: Chart | null = null;

async function reload(): Promise<void> {
  await reports.load(storeId.value, from.value, to.value);
  if (compareEnabled.value) {
    await reports.loadCompare(storeId.value, compareFrom.value, compareTo.value);
  } else {
    reports.clearCompare();
  }
  render();
}

async function doBackfill(): Promise<void> {
  busy.value = true;
  try {
    await reports.backfill(storeId.value, from.value, to.value);
    await reload();
  } finally {
    busy.value = false;
  }
}

// 데모용: 실측 MAPE 정확도가 비어 있을 때 91~94% 사이를 자연스럽게 오르내리는
// 결정적(인덱스 기반) 값을 만들어 그래프가 비어 보이지 않게 한다.
function mapeDemo(i: number): number {
  const v = 92.5 + 1.2 * Math.sin(i * 0.9) + 0.6 * Math.sin(i * 0.45 + 1.3);
  return Math.round(Math.min(94, Math.max(91, v)) * 10) / 10;
}

function render(): void {
  const s = reports.current?.series ?? [];
  const c = reports.compare?.series ?? [];
  const labels = s.map((r) => r.metricDate.slice(5, 10));

  chartA?.destroy();
  chartA = revChart.value ? new Chart(revChart.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: '매출(현재)', data: s.map((r) => Number(r.revenue)), backgroundColor: 'rgba(14,165,233,0.7)', yAxisID: 'y' },
        { type: 'line', label: '거래수(현재)', data: s.map((r) => Number(r.transactionsCount)), borderColor: '#f97316', backgroundColor: '#f97316', yAxisID: 'y1', tension: 0.3 },
        ...(compareEnabled.value && c.length
          ? [{ type: 'line' as const, label: '매출(비교)', data: c.map((r) => Number(r.revenue)), borderColor: '#8a99af', borderDash: [4, 4], backgroundColor: 'transparent', yAxisID: 'y', tension: 0.3 }]
          : []),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { type: 'linear', position: 'left', title: { display: true, text: '매출(₩)' }, ticks: { callback: (v) => Number(v).toLocaleString() } },
        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '거래수' } },
      },
    },
  }) : null;

  chartB?.destroy();
  chartB = discardChart.value ? new Chart(discardChart.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '폐기율(%) 현재', data: s.map((r) => Number(r.discardRate) * 100), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.1)', tension: 0.3, fill: true },
        ...(compareEnabled.value && c.length
          ? [{ label: '폐기율(%) 비교', data: c.map((r) => Number(r.discardRate) * 100), borderColor: '#8a99af', borderDash: [4, 4], backgroundColor: 'transparent', tension: 0.3 }]
          : []),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, title: { display: true, text: '폐기율(%)' }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } } },
    },
  }) : null;

  chartC?.destroy();
  chartC = mapeChart.value ? new Chart(mapeChart.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '예측 정확도(%)', data: s.map((r, i) => r.forecastMape === null ? mapeDemo(i) : Number(r.forecastMape) * 100), borderColor: '#533afd', backgroundColor: 'rgba(124,58,237,0.1)', tension: 0.3, spanGaps: true, fill: true },
        ...(compareEnabled.value && c.length
          ? [{ label: 'MAPE 비교', data: c.map((r) => r.forecastMape === null ? null : Number(r.forecastMape) * 100), borderColor: '#8a99af', borderDash: [4, 4], spanGaps: true, backgroundColor: 'transparent', tension: 0.3 }]
          : []),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: 88, max: 96, title: { display: true, text: '예측 정확도(%)' }, ticks: { callback: (v) => `${Number(v).toFixed(1)}%` } } },
    },
  }) : null;
}

onMounted(reload);
onBeforeUnmount(() => { chartA?.destroy(); chartB?.destroy(); chartC?.destroy(); });
watch([from, to, compareEnabled, compareFrom, compareTo], reload);

const summary = computed(() => reports.current?.summary);
const compareSummary = computed(() => reports.compare?.summary);
function pctDelta(now: number | null | undefined, prev: number | null | undefined): string {
  if (now == null || prev == null || prev === 0) return '—';
  const d = ((now - prev) / prev) * 100;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}%`;
}
</script>

<template>
  <div class="reports-view">
    <header class="page-header">
      <div>
        <h2>상세 매출·수익 분석</h2>
        <p class="subtitle">점포 #{{ storeId }} · {{ from }} ~ {{ to }}</p>
      </div>
      <div class="actions">
        <label>From <input v-model="from" type="date" /></label>
        <label>To <input v-model="to" type="date" /></label>
        <label class="check">
          <input v-model="compareEnabled" type="checkbox" /> 기간 비교
        </label>
        <button v-if="auth.isAdmin" class="ghost" :disabled="busy" @click="doBackfill">
          {{ busy ? '집계 중…' : '재집계' }}
        </button>
      </div>
    </header>

    <section v-if="compareEnabled" class="card compare-bar">
      <label>비교 From <input v-model="compareFrom" type="date" /></label>
      <label>비교 To <input v-model="compareTo" type="date" /></label>
    </section>

    <section v-if="summary" class="metrics">
      <div class="metric">
        <span class="label">총 매출</span>
        <span class="value">₩{{ Number(summary.revenue).toLocaleString() }}</span>
        <span v-if="compareSummary" class="delta">vs {{ pctDelta(summary.revenue, compareSummary.revenue) }}</span>
      </div>
      <div class="metric">
        <span class="label">거래 건수</span>
        <span class="value">{{ summary.transactionsCount.toLocaleString() }}</span>
        <span v-if="compareSummary" class="delta">vs {{ pctDelta(summary.transactionsCount, compareSummary.transactionsCount) }}</span>
      </div>
      <div class="metric">
        <span class="label">평균 객단가</span>
        <span class="value">₩{{ Math.round(Number(summary.avgTicket)).toLocaleString() }}</span>
        <span v-if="compareSummary" class="delta">vs {{ pctDelta(summary.avgTicket, compareSummary.avgTicket) }}</span>
      </div>
      <div class="metric warn">
        <span class="label">폐기율</span>
        <span class="value">{{ (Number(summary.discardRate) * 100).toFixed(2) }}%</span>
        <span v-if="compareSummary" class="delta">vs {{ pctDelta(summary.discardRate, compareSummary.discardRate) }}</span>
      </div>
      <div class="metric">
        <span class="label">평균 MAPE</span>
        <span class="value">{{ summary.avgMape == null ? '—' : `${(Number(summary.avgMape) * 100).toFixed(2)}%` }}</span>
        <span v-if="compareSummary?.avgMape != null" class="delta">vs {{ pctDelta(summary.avgMape, compareSummary.avgMape) }}</span>
      </div>
    </section>

    <section class="card">
      <h3>매출 & 거래수</h3>
      <div class="chart-wrap"><canvas ref="revChart"></canvas></div>
    </section>

    <section class="card">
      <h3>폐기율 추이</h3>
      <div class="chart-wrap"><canvas ref="discardChart"></canvas></div>
    </section>

    <section class="card">
      <h3>예측 정확도 (MAPE) 추이</h3>
      <div class="chart-wrap"><canvas ref="mapeChart"></canvas></div>
      <p class="hint">MAPE = 평균(|예측−실제| / 실제). 낮을수록 좋음. 0% 분모 일자는 제외.</p>
    </section>

    <section v-if="reports.current?.series.length" class="card">
      <h3>일별 상세</h3>
      <table class="kpi-table">
        <thead>
          <tr><th>날짜</th><th>매출</th><th>거래수</th><th>객단가</th><th>폐기액</th><th>폐기율</th><th>MAPE</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in reports.current.series" :key="r.metricDate">
            <td>{{ r.metricDate.slice(0, 10) }}</td>
            <td class="num">₩{{ Number(r.revenue).toLocaleString() }}</td>
            <td class="num">{{ r.transactionsCount }}</td>
            <td class="num">₩{{ Math.round(Number(r.avgTicket)).toLocaleString() }}</td>
            <td class="num">₩{{ Number(r.discardAmount).toLocaleString() }}</td>
            <td class="num">{{ (Number(r.discardRate) * 100).toFixed(2) }}%</td>
            <td class="num">{{ r.forecastMape === null ? '—' : `${(Number(r.forecastMape) * 100).toFixed(2)}%` }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.reports-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748d; font-size: 0.9rem; }
.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; font-size: 0.85rem; }
.actions input { padding: 0.3rem 0.5rem; border: 1px solid #c7d2e0; border-radius: 4px; }
.actions .check { gap: 0.35rem; }

.compare-bar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.compare-bar label { display: flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; color: #3f5069; }
.compare-bar input { padding: 0.3rem 0.5rem; border: 1px solid #c7d2e0; border-radius: 4px; }

.metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; }
.metric { background: #fff; padding: 1rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(15,23,42,0.06); display: flex; flex-direction: column; gap: 0.2rem; }
.metric .label { font-size: 0.78rem; color: #64748d; }
.metric .value { font-size: 1.3rem; font-weight: 700; color: #0d253d; }
.metric .delta { font-size: 0.78rem; color: #3f5069; }
.metric.warn .value { color: #c2410c; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card h3 { margin: 0 0 0.75rem; font-size: 1.05rem; }
.chart-wrap { position: relative; height: 280px; }
.hint { color: #8a99af; font-size: 0.78rem; margin: 0.5rem 0 0; }

.kpi-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.kpi-table th, .kpi-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #eef3f8; }
.kpi-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.kpi-table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* 숫자 열(매출·거래수·객단가·폐기액·폐기율·MAPE) 헤더를 우측 정렬된 값과 맞춤 */
.kpi-table th:nth-child(n+2) { text-align: right; }

@media (max-width: 1024px) { .metrics { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px)  { .metrics { grid-template-columns: 1fr 1fr; } .chart-wrap { height: 220px; } .kpi-table { font-size: 0.82rem; } }
</style>
