<script setup lang="ts">
/**
 * 002 (T039) — Vision 히트맵·행동 분석 화면 (FR-011~013, SC-007)
 *   매대 히트맵(체류) + 관심 행동 통계 + 추정 세그먼트(비식별) + 배치 개선 제안.
 */
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAnalyticsStore } from '@/stores/analytics';

const auth = useAuthStore();
const analytics = useAnalyticsStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const GRID_COLS = 4;
const GRID_ROWS = 3;

// (row,col) → cell 매핑
const grid = computed(() => {
  const map = new Map(analytics.cells.map((c) => [`${c.row}:${c.col}`, c]));
  const out: (typeof analytics.cells[number] | null)[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowArr: (typeof analytics.cells[number] | null)[] = [];
    for (let c = 0; c < GRID_COLS; c++) rowArr.push(map.get(`${r}:${c}`) ?? null);
    out.push(rowArr);
  }
  return out;
});

function heatColor(intensity: number): string {
  // 파랑(저) → 빨강(고)
  const hue = 220 - intensity * 220;
  return `hsl(${hue}, 80%, ${88 - intensity * 35}%)`;
}

const SUG_ICON: Record<string, string> = {
  high_traffic_low_pickup: '📍',
  low_conversion: '⚠️',
  hot_zone: '🔥',
};

async function load(): Promise<void> {
  await analytics.refresh(storeId.value);
}
async function rebuild(): Promise<void> {
  await analytics.rebuild(storeId.value);
}

onMounted(load);
</script>

<template>
  <div class="analytics-view">
    <header class="page-header">
      <div>
        <h2>매장 행동 분석</h2>
        <p class="subtitle">점포 #{{ storeId }} · 비식별 동선·관심 행동 · {{ analytics.date }}</p>
      </div>
      <div class="actions">
        <button class="ghost" :disabled="analytics.loading" @click="load">새로고침</button>
        <button v-if="auth.isAdmin" class="primary" @click="rebuild">집계 재생성</button>
      </div>
    </header>

    <p class="privacy">🔒 모든 통계는 비식별 집계입니다 — 개인을 식별하는 데이터는 저장·표시하지 않습니다.</p>
    <p v-if="analytics.lastError" class="error">{{ analytics.lastError }}</p>

    <div class="two-col">
      <!-- 히트맵 -->
      <section class="card">
        <div class="card-header"><h3>매대 히트맵 (체류 강도)</h3></div>
        <div v-if="analytics.loading" class="loading">불러오는 중…</div>
        <div v-else class="heatmap">
          <div v-for="(row, ri) in grid" :key="ri" class="heat-row">
            <div
              v-for="(cell, ci) in row"
              :key="ci"
              class="heat-cell"
              :class="{ empty: !cell }"
              :style="cell ? { background: heatColor(cell.intensity) } : {}"
              :title="cell ? `${cell.zoneLabel}: 체류 ${cell.dwellWeight}` : ''"
            >
              <template v-if="cell">
                <span class="zone-code">{{ cell.zoneCode }}</span>
                <span class="zone-label">{{ cell.zoneLabel }}</span>
                <span class="zone-int">{{ Math.round(cell.intensity * 100) }}</span>
              </template>
            </div>
          </div>
        </div>
        <div class="legend"><span>낮음</span><span class="legend-bar"></span><span>높음</span></div>
      </section>

      <!-- 배치 개선 제안 -->
      <section class="card">
        <div class="card-header"><h3>배치 개선 제안</h3></div>
        <div v-if="analytics.suggestions.length === 0" class="empty">개선 제안이 없습니다. 핫존 배치가 양호합니다.</div>
        <ul v-else class="sug-list">
          <li v-for="s in analytics.suggestions" :key="s.zoneCode + s.type" class="sug-item" :data-type="s.type">
            <span class="sug-icon">{{ SUG_ICON[s.type] }}</span>
            <span class="sug-msg">{{ s.message }}</span>
          </li>
        </ul>
      </section>
    </div>

    <!-- 관심 행동 통계 -->
    <section class="card">
      <div class="card-header"><h3>존별 관심 행동</h3></div>
      <table class="zone-table">
        <thead>
          <tr><th>존</th><th>통과</th><th>집음</th><th>내려놓음</th><th>집음률</th><th>전환율</th><th>추정 세그먼트(비식별)</th></tr>
        </thead>
        <tbody>
          <tr v-for="z in analytics.zones" :key="z.zoneCode">
            <td>{{ z.zoneLabel }} <small>({{ z.zoneCode }})</small></td>
            <td>{{ z.passCount }}</td>
            <td>{{ z.pickupCount }}</td>
            <td>{{ z.putbackCount }}</td>
            <td>{{ Math.round(z.pickupRate * 100) }}%</td>
            <td>{{ Math.round(z.conversionRate * 100) }}%</td>
            <td class="seg">
              <template v-if="z.demoSegment && z.demoSegment.gender && z.demoSegment.gender.male !== undefined">
                남 {{ z.demoSegment.gender.male }}% / 여 {{ z.demoSegment.gender.female }}%
              </template>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.analytics-view { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
.subtitle { color: #6b7280; font-size: 0.9rem; margin: 0.2rem 0 0; }
.actions { display: flex; gap: 0.5rem; }
.privacy { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.82rem; margin: 0; }
.two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1rem; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; }
.card-header { margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; }
.heatmap { display: flex; flex-direction: column; gap: 6px; }
.heat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.heat-cell { aspect-ratio: 5 / 3; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.3rem; text-align: center; }
.heat-cell.empty { background: #f8fafc; border: 1px dashed #e2e8f0; }
.zone-code { font-size: 0.7rem; font-weight: 700; color: #1e293b; }
.zone-label { font-size: 0.72rem; color: #334155; }
.zone-int { font-size: 0.95rem; font-weight: 800; color: #0f172a; }
.legend { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; font-size: 0.75rem; color: #64748b; }
.legend-bar { flex: 1; height: 8px; border-radius: 4px; background: linear-gradient(90deg, hsl(220,80%,88%), hsl(0,80%,53%)); }
.sug-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.sug-item { display: flex; gap: 0.5rem; padding: 0.6rem; border-radius: 8px; background: #f8fafc; border-left: 3px solid #94a3b8; font-size: 0.85rem; }
.sug-item[data-type='hot_zone'] { border-left-color: #ef4444; background: #fef2f2; }
.sug-item[data-type='high_traffic_low_pickup'] { border-left-color: #f59e0b; background: #fffbeb; }
.sug-icon { font-size: 1.1rem; }
.zone-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.zone-table th, .zone-table td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #f3f4f6; }
.seg { color: #475569; }
.empty, .loading, .muted { color: #9ca3af; font-size: 0.9rem; }
.error { color: #dc2626; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
</style>
