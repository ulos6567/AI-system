<script setup lang="ts">
/**
 * 002 (T022) — 데이터 대시보드 (FR-007~010, SC-008)
 *   기간/카테고리 필터 + KPI 카드 + 일별 매출 차트 + 카테고리 분해 + 상위 상품(이미지 100%).
 */
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDashboardStore } from '@/stores/dashboard';
import { anomaliesApi, type AnomalyEvent } from '@/api/anomalies';
import { reportsApi, type DailyKpiRow } from '@/api/reports';

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

// ── 통합: 실시간 이상 신호(배너) + 상세 매출·수익 분석(차트) ──────────
const anomalies = ref<AnomalyEvent[]>([]);
const reportSeries = ref<DailyKpiRow[]>([]);
const reportSummary = ref<{ discardRate: number; avgMape: number | null } | null>(null);

const ANOMALY_LABEL: Record<string, string> = {
  unpaid_exit: '미결제 퇴장',
  disturbance: '매장 소란',
  collapse: '진열 붕괴',
  intrusion: '외부 침입',
};
const activeAnomalies = computed(() =>
  anomalies.value.filter((a) => a.falsePositive !== true && !a.resolution),
);
const maxDiscard = computed(() => Math.max(1, ...reportSeries.value.map((r) => Number(r.discardAmount) || 0)));
const forecastAccuracy = computed(() => {
  const m = reportSummary.value?.avgMape;
  return m == null ? null : Math.max(0, 100 - m);
});
function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
async function loadExtras(): Promise<void> {
  try {
    const [an, rep] = await Promise.all([
      anomaliesApi.list(storeId.value, { limit: 50 }),
      reportsApi.daily(storeId.value, dash.from ?? undefined, dash.to ?? undefined),
    ]);
    anomalies.value = an.anomalies;
    reportSeries.value = rep.series;
    reportSummary.value = { discardRate: rep.summary.discardRate, avgMape: rep.summary.avgMape };
  } catch {
    /* 통합 위젯 실패는 대시보드 본문에 영향 없음 */
  }
}

async function applyRange(days: number): Promise<void> {
  dash.setRange(days);
  await dash.load(storeId.value);
  await loadExtras();
}
async function applyCategory(c: string | null): Promise<void> {
  dash.category = c;
  await dash.load(storeId.value);
}

onMounted(async () => {
  dash.setRange(30);
  await dash.load(storeId.value);
  await loadExtras();
});
</script>

<template>
  <div class="dashboard">
    <header class="page-header">
      <div>
        <h2>매장 종합 현황</h2>
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

    <!-- 통합: 실시간 이상 신호 알림 배너 -->
    <div v-if="activeAnomalies.length" class="anomaly-banner">
      <span class="ab-icon">🚨</span>
      <span class="ab-text">
        실시간 이상 신호 <strong>{{ activeAnomalies.length }}건</strong> 감지
        <span class="ab-sep">·</span>
        최근 {{ ANOMALY_LABEL[activeAnomalies[0].anomalyType] ?? activeAnomalies[0].anomalyType }}
        <span v-if="activeAnomalies[0].zoneCode" class="ab-zone">{{ activeAnomalies[0].zoneCode }}</span>
        <span class="ab-time">{{ hhmm(activeAnomalies[0].detectedAt) }}</span>
      </span>
    </div>

    <div v-if="dash.loading" class="loading">불러오는 중…</div>

    <div v-else-if="dash.data" class="grid-7-3">
      <!-- 왼쪽 70% : 차트 2개 세로 배치 -->
      <div class="col-left">
        <!-- 일별 매출 추이 -->
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

        <!-- 카테고리별 매출 -->
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

        <!-- 통합: 상세 매출·수익 분석 (일별 폐기 손실 추이) -->
        <section class="card">
          <div class="card-header">
            <h3>매출·수익 분석</h3>
            <span v-if="reportSummary" class="report-kpi">
              폐기율 {{ (reportSummary.discardRate * 100).toFixed(1) }}%
              <template v-if="forecastAccuracy !== null"> · 예측정확도 {{ forecastAccuracy.toFixed(1) }}%</template>
            </span>
          </div>
          <div v-if="reportSeries.length === 0" class="empty">분석 데이터가 없습니다.</div>
          <template v-else>
            <div class="bar-chart">
              <div
                v-for="r in reportSeries"
                :key="r.metricDate"
                class="bar-col"
                :title="`${r.metricDate.slice(0, 10)} · 폐기 손실 ${won(Number(r.discardAmount))}`"
              >
                <div class="bar bar-amber" :style="{ height: `${(Number(r.discardAmount) / maxDiscard) * 100}%` }"></div>
              </div>
            </div>
            <p class="chart-cap">일별 폐기 손실액 추이 (낮을수록 좋아요)</p>
          </template>
        </section>
      </div>

      <!-- 오른쪽 30% : KPI 4개 세로 + 판매 상위 상품 -->
      <div class="col-right">
        <div class="kpi-col">
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
        </div>

        <section class="card">
          <div class="card-header"><h3>판매 상위 상품</h3></div>
          <ul class="top-list">
            <li v-for="(p, i) in dash.data.topProducts" :key="p.productId" class="top-row">
              <span class="rank">{{ i + 1 }}</span>
              <div class="top-info">
                <span class="top-name">{{ p.name }}</span>
                <span class="top-meta">{{ p.units.toLocaleString('ko-KR') }}개 · {{ won(p.revenue) }}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; }
.subtitle { color: #64748d; font-size: 0.9rem; margin: 0.2rem 0 0; }
.range-group { display: inline-flex; border: 1px solid #cdd7e3; border-radius: 8px; overflow: hidden; }
.range-btn { background: #fff; border: none; padding: 0.4rem 0.9rem; cursor: pointer; border-right: 1px solid #e3e8ee; }
.range-btn:last-child { border-right: none; }
.range-btn.active { background: #533afd; color: #fff; }
/* 7:3 2단 그리드 — 왼쪽 차트 / 오른쪽 KPI+상위상품 */
.grid-7-3 { display: grid; grid-template-columns: 7fr 3fr; gap: 1rem; align-items: start; }
.col-left, .col-right { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.kpi-col { display: flex; flex-direction: column; gap: 0.75rem; }
.kpi-card {
  background: #ffffff;
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.kpi-label { color: #64748d; font-size: 0.8rem; }
.kpi-value { font-size: 1.35rem; font-weight: 700; color: #0d253d; }
.card {
  background: #ffffff;
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  padding: 1rem;
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; }
.chip { font-size: 0.8rem; color: #64748d; }
.chip a { color: #533afd; cursor: pointer; text-decoration: underline; }
.bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 180px; }
.bar-col { flex: 1; display: flex; justify-content: center; align-items: flex-end; height: 100%; }
.bar {
  width: 50%;          /* 슬림한 막대 — 컬럼 안에 가운데 정렬 */
  max-width: 12px;     /* 기간이 짧아도 막대가 뚱뚱해지지 않게 */
  /* 위쪽 밝은 보라 → 아래쪽 짙은 보라로 이어지는 은은한 그라데이션 */
  background: linear-gradient(180deg, #7b6bff 0%, #4d3ad4 100%);
  border-radius: 6px 6px 0 0; /* 상단 모서리만 둥글게 */
  min-height: 2px;
  transition: height 0.2s ease, filter 0.15s ease;
}
.bar:hover { filter: brightness(1.08); }
.bar.bar-amber { background: linear-gradient(180deg, #fcd34d 0%, #f59e0b 100%); }
/* 통합: 이상 신호 배너 */
.anomaly-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 12px;
  padding: 0.7rem 1rem;
  font-size: 0.88rem;
  font-weight: 600;
}
.ab-sep { opacity: 0.5; margin: 0 0.15rem; }
.ab-zone { background: rgba(220, 38, 38, 0.1); border-radius: 6px; padding: 0.05rem 0.4rem; font-size: 0.78rem; margin-left: 0.3rem; }
.ab-time { color: #ef4444; font-weight: 500; margin-left: 0.4rem; }
/* 통합: 매출·수익 분석 차트 */
.report-kpi { font-size: 0.8rem; color: #64748d; font-weight: 600; }
.chart-cap { margin: 0.5rem 0 0; font-size: 0.75rem; color: #8a99af; text-align: center; }
.cat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.cat-row { display: grid; grid-template-columns: 5rem 1fr auto; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.2rem; border-radius: 6px; }
.cat-row:hover, .cat-row.active { background: #eef3f8; }
.cat-name { font-size: 0.85rem; }
.cat-bar-wrap { background: #eef3f8; border-radius: 4px; height: 14px; overflow: hidden; }
.cat-bar { display: block; height: 100%; background: #533afd; border-radius: 4px; }
.cat-val { font-size: 0.8rem; color: #3f5069; white-space: nowrap; }
.top-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.top-row { display: flex; align-items: center; gap: 0.6rem; }
.rank { width: 1.4rem; text-align: center; font-weight: 700; color: #8a99af; }
.top-info { display: flex; flex-direction: column; }
.top-name { font-size: 0.88rem; font-weight: 600; }
.top-meta { font-size: 0.78rem; color: #64748d; }
.empty, .loading { color: #8a99af; font-size: 0.9rem; padding: 1rem 0; }
.error { color: #dc2626; }
@media (max-width: 1024px) {
  /* 좁은 화면 — 7:3 해제하고 1단으로, KPI는 2열 그리드로 */
  .grid-7-3 { grid-template-columns: 1fr; }
  .kpi-col { display: grid; grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .kpi-col { grid-template-columns: 1fr; }
}
</style>
