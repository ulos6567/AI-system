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

// 체류 강도(0~1) → 인디고 퍼플 단일 톤 그라데이션
//   낮음: 연한 라벤더 그레이 → 높음: 진한 인디고 보라
function heatColor(intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity));
  const sat = 25 + i * 50; // 저강도는 채도 낮은 그레이톤, 고강도는 선명한 보라
  const light = 95 - i * 58; // 95% → 37%
  return `hsl(250, ${sat}%, ${light}%)`;
}

// 강도가 높은 셀은 흰 글씨로 강조
function heatText(intensity: number): string {
  return intensity >= 0.5 ? '#ffffff' : '#3a2f6b';
}

const imp = computed(() => analytics.impulse);
function pct(n: number): number {
  return Math.round(n * 100);
}
// 시간대 라벨 → 아이콘
const bucketIcon: Record<string, string> = { 아침: '🌅', 점심: '🍱', 오후: '☕', 저녁: '🌆', 심야: '🌙' };

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
        <h2>구역별 상품 진열 최적화</h2>
        <p class="subtitle">점포 #{{ storeId }} · 고객 동선·관심 분석 (비식별) · {{ analytics.date }}</p>
      </div>
      <div class="actions">
        <button class="ghost" :disabled="analytics.loading" @click="load">새로고침</button>
        <button v-if="auth.isAdmin" class="primary" @click="rebuild">집계 재생성</button>
      </div>
    </header>

    <p class="privacy">🔒 모든 통계는 비식별 집계입니다 — 개인을 식별하는 데이터는 저장·표시하지 않습니다.</p>
    <p v-if="analytics.lastError" class="error">{{ analytics.lastError }}</p>

    <!-- 충동 최적 구역 (Impulse Zone) — 계산대 대기 구역 -->
    <section v-if="imp" class="card impulse">
      <div class="card-header impulse-head">
        <div>
          <h3>🛒 충동 최적 구역 (Impulse Zone) — {{ imp.zone.label }}</h3>
          <p class="impulse-sub">
            계산대 줄서기 대기 중 미니 매대(껌·미니 젤리·수입 초콜릿·숙취해소제 등) 터치 ↔ 실제 결제 매칭 ·
            대기 <b>{{ imp.waitThresholdSec }}초↑</b> 구간 분석
          </p>
        </div>
        <div class="wait-badges">
          <span class="wait-chip">평균 대기 <b>{{ imp.avgWaitSec }}초</b></span>
          <span class="wait-chip thresh">대기 기준 {{ imp.waitThresholdSec }}초</span>
        </div>
      </div>

      <!-- 라인업 추천 (핵심) -->
      <h4 class="blk-title">📌 대기 구역 미니 매대 라인업 추천</h4>
      <div v-if="imp.recommendations.length === 0" class="empty">대기 30초 이상 구간이 없어 추천이 없습니다.</div>
      <ul v-else class="rec-list">
        <li v-for="(r, i) in imp.recommendations" :key="i" class="rec-card">
          <span class="rec-seg">{{ bucketIcon[r.segmentLabel.split(' ')[1]] ?? '🕒' }} {{ r.segmentLabel }}</span>
          <span class="rec-items">
            <span v-for="it in r.items" :key="it" class="rec-item">{{ it }}</span>
          </span>
          <span class="rec-uplift">구매 전환율 <b>+{{ r.upliftPct }}%</b></span>
        </li>
      </ul>

      <!-- 카테고리별 터치/전환 (대기≥30초) -->
      <h4 class="blk-title">대기 길어질 때 손이 가는 카테고리 (대기 {{ imp.waitThresholdSec }}초↑ 누적)</h4>
      <table class="imp-table">
        <thead>
          <tr><th>카테고리</th><th>터치 수</th><th>결제 전환</th><th>전환율</th><th>대기 시 상승</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in imp.categories" :key="c.key" :class="{ rec: c.recommended }">
            <td>
              <span v-if="c.recommended" class="star">★</span>{{ c.label }}
              <span v-if="c.recommended" class="rec-tag">추천</span>
            </td>
            <td>{{ c.touches.toLocaleString() }}</td>
            <td>{{ c.buys.toLocaleString() }}</td>
            <td>{{ pct(c.conversionRate) }}%</td>
            <td class="up">+{{ c.upliftPct }}%</td>
          </tr>
        </tbody>
      </table>

      <!-- 대기 긴 구간 -->
      <h4 class="blk-title">대기가 길어지는 요일·시간대 (추정 대기시간)</h4>
      <div class="seg-chips">
        <span
          v-for="s in imp.segments.filter((x) => x.longWait).slice(0, 8)"
          :key="s.dow + s.bucket"
          class="seg-chip"
        >
          {{ bucketIcon[s.bucket] }} {{ s.dowLabel }} {{ s.bucket }}
          <b>{{ s.avgWaitSec }}초</b>
          <small>· {{ s.topCategories[0]?.label }}</small>
        </span>
      </div>
      <p class="imp-note">
        ※ 충동 카테고리는 상품 마스터에 없어, 실거래 트래픽(요일×시간대) 밀도에 근거한 결정적 추정으로 보강한 비식별 집계입니다.
      </p>
    </section>

    <div class="two-col">
      <!-- 히트맵 -->
      <section class="card">
        <div class="card-header"><h3>고객이 오래 머문 구역</h3></div>
        <div v-if="analytics.loading" class="loading">불러오는 중…</div>
        <div v-else class="heatmap">
          <div v-for="(row, ri) in grid" :key="ri" class="heat-row">
            <div
              v-for="(cell, ci) in row"
              :key="ci"
              class="heat-cell"
              :class="{ empty: !cell }"
              :style="cell ? { background: heatColor(cell.intensity), color: heatText(cell.intensity) } : {}"
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
            <span class="sug-zone">{{ s.zoneCode }}</span>
            <span class="sug-msg">{{ s.message }}</span>
          </li>
        </ul>
      </section>
    </div>

    <!-- 관심 행동 통계 -->
    <section class="card">
      <div class="card-header"><h3>구역별 고객 반응</h3></div>
      <table class="zone-table">
        <thead>
          <tr><th>구역</th><th>지나간 손님</th><th>집어든 횟수</th><th>다시 내려놓음</th><th>관심률</th><th>구매율</th><th>주요 고객층 (비식별)</th></tr>
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
.subtitle { color: #64748d; font-size: 0.9rem; margin: 0.2rem 0 0; }
.actions { display: flex; gap: 0.5rem; }
.privacy { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.82rem; margin: 0; }
.two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1rem; }
.card { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px; padding: 1rem; }
.card-header { margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; }
.heatmap { display: flex; flex-direction: column; gap: 6px; }
.heat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.heat-cell { aspect-ratio: 5 / 3; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.3rem; text-align: center; transition: transform 0.12s ease; }
.heat-cell:not(.empty):hover { transform: scale(1.03); }
.heat-cell.empty { background: #f6f7fb; border: 1px dashed #e6e4f2; }
.zone-code { font-size: 0.7rem; font-weight: 700; color: inherit; opacity: 0.9; }
.zone-label { font-size: 0.72rem; color: inherit; opacity: 0.8; }
.zone-int { font-size: 0.95rem; font-weight: 800; color: inherit; }
.legend { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; font-size: 0.75rem; color: #64748d; }
.legend-bar { flex: 1; height: 8px; border-radius: 4px; background: linear-gradient(90deg, hsl(250,25%,95%), hsl(250,75%,37%)); }
.sug-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.sug-item {
  display: flex; flex-direction: column; gap: 0.3rem;
  padding: 0.8rem 0.95rem; border-radius: 12px;
  background: #fff; border: 1px solid #eef1f6; border-left: 4px solid #533afd;
  box-shadow: 0 1px 3px rgba(28, 30, 84, 0.06);
  font-size: 0.88rem; line-height: 1.55;
}
.sug-item[data-type='hot_zone'] { border-left-color: #533afd; }
.sug-item[data-type='high_traffic_low_pickup'] { border-left-color: #f59e0b; }
.sug-item[data-type='low_conversion'] { border-left-color: #f59e0b; }
.sug-zone { font-size: 0.72rem; font-weight: 700; color: #4434d4; letter-spacing: 0.02em; }
.sug-msg { color: #334155; }
.zone-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.zone-table th, .zone-table td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eef3f8; }

/* 충동 최적 구역 (Impulse Zone) */
.impulse { border-left: 4px solid #533afd; background: linear-gradient(180deg, #fbfaff 0%, #ffffff 60%); }
.impulse-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.6rem; }
.impulse-head h3 { margin: 0; font-size: 1.02rem; }
.impulse-sub { margin: 0.25rem 0 0; font-size: 0.82rem; color: #64748d; line-height: 1.5; }
.impulse-sub b { color: #4434d4; }
.wait-badges { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.wait-chip { font-size: 0.78rem; color: #334155; background: #fff; border: 1px solid #ddd9fb; border-radius: 999px; padding: 0.25rem 0.65rem; }
.wait-chip b { color: #533afd; }
.wait-chip.thresh { color: #92400e; background: #fef3c7; border-color: #fde68a; }
.blk-title { margin: 1.1rem 0 0.55rem; font-size: 0.86rem; color: #475569; font-weight: 700; }
.rec-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.rec-card {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  padding: 0.7rem 0.85rem; border-radius: 12px; background: #fff;
  border: 1px solid #eceafc; border-left: 4px solid #533afd; box-shadow: 0 1px 3px rgba(28,30,84,0.06);
}
.rec-seg { font-weight: 700; color: #3a2f6b; font-size: 0.88rem; }
.rec-items { display: flex; gap: 0.3rem; flex-wrap: wrap; flex: 1; }
.rec-item { font-size: 0.78rem; font-weight: 600; color: #4434d4; background: #f1efff; border-radius: 999px; padding: 0.15rem 0.55rem; }
.rec-uplift { font-size: 0.82rem; color: #475569; }
.rec-uplift b { color: #059669; font-size: 0.95rem; }
.imp-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.imp-table th, .imp-table td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #eef3f8; }
.imp-table tr.rec { background: #faf9ff; }
.imp-table td.up { color: #059669; font-weight: 700; }
.star { color: #f59e0b; margin-right: 0.2rem; }
.rec-tag { margin-left: 0.35rem; font-size: 0.68rem; font-weight: 700; color: #4434d4; background: #ece9fd; border-radius: 999px; padding: 0.05rem 0.4rem; }
.seg-chips { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.seg-chip { font-size: 0.78rem; color: #334155; background: #fff; border: 1px solid #e6e4f2; border-radius: 8px; padding: 0.3rem 0.55rem; }
.seg-chip b { color: #533afd; margin: 0 0.15rem; }
.seg-chip small { color: #8a99af; }
.imp-note { margin: 0.8rem 0 0; font-size: 0.76rem; color: #94a3b8; line-height: 1.5; }
@media (max-width: 720px) { .rec-list { grid-template-columns: 1fr; } }
.seg { color: #3f5069; }
.empty, .loading, .muted { color: #8a99af; font-size: 0.9rem; }
.error { color: #dc2626; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
</style>
