<script setup lang="ts">
/**
 * 판매 패턴 분석 (매장 분석)
 *   ① 요일×시간대 피크 히트맵 — 언제 붐비는지(인력·발주·진열 타이밍)
 *   ② 장바구니 연관분석 — 무엇과 무엇이 함께 팔리는지(교차판매·묶음 진열)
 */
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { salesPatternsApi, type PeakHeatmap, type BasketAnalysis } from '@/api/salesPatterns';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const heat = ref<PeakHeatmap | null>(null);
const basket = ref<BasketAnalysis | null>(null);
const loading = ref(false);
const lastError = ref<string | null>(null);

// 표시 순서: 월~일 (DAYOFWEEK: 1=일,2=월,…,7=토)
const DOW_ORDER = [2, 3, 4, 5, 6, 7, 1];
const DOW_LABEL: Record<number, string> = { 1: '일', 2: '월', 3: '화', 4: '수', 5: '목', 6: '금', 7: '토' };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const cellMap = computed(() => {
  const m = new Map<string, { tx: number; revenue: number }>();
  for (const c of heat.value?.cells ?? []) m.set(`${c.dow}:${c.hour}`, { tx: c.tx, revenue: c.revenue });
  return m;
});
function cellAt(dow: number, hour: number): { tx: number; revenue: number } | null {
  return cellMap.value.get(`${dow}:${hour}`) ?? null;
}
// 거래량 강도(0~1) → 인디고 퍼플 톤
function heatColor(tx: number): string {
  const max = heat.value?.maxTx ?? 1;
  const i = Math.max(0, Math.min(1, tx / Math.max(1, max)));
  if (tx === 0) return '#f6f7fb';
  const light = 94 - i * 56;
  const sat = 30 + i * 50;
  return `hsl(250, ${sat}%, ${light}%)`;
}
function heatText(tx: number): string {
  const max = heat.value?.maxTx ?? 1;
  return tx / Math.max(1, max) >= 0.55 ? '#fff' : '#3a2f6b';
}
function ampm(h: number): string {
  if (h === 0) return '0시';
  return `${h}시`;
}
const peakText = computed(() => {
  const p = heat.value?.peak;
  if (!p) return '—';
  return `${DOW_LABEL[p.dow]}요일 ${ampm(p.hour)} (거래 ${p.tx}건)`;
});
// 요일 합계 최댓값(마진 막대 정규화용)
const maxDowTotal = computed(() => Math.max(1, ...(heat.value?.dowTotals ?? []).map((d) => d.tx)));

function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
function slotLabel(dow: number, hour: number): string {
  return `${DOW_LABEL[dow]}요일 ${ampm(hour)}`;
}

// ── 피크 히트맵 → 운영 활용 인사이트 ──────────────────────────────────────
// 가장 붐비는 시간대 TOP3
const topBusy = computed(() => [...(heat.value?.cells ?? [])].sort((a, b) => b.tx - a.tx).slice(0, 3));
// 가장 한산한(거래 있는) 시간대 TOP3
const topIdle = computed(() =>
  [...(heat.value?.cells ?? [])].filter((c) => c.tx > 0).sort((a, b) => a.tx - b.tx).slice(0, 3),
);
// 요일 인사이트: 최다/최소 요일, 주중 vs 주말 일평균
const dayStats = computed(() => {
  const t = heat.value?.dowTotals ?? [];
  if (!t.length) return null;
  const busiest = [...t].sort((a, b) => b.tx - a.tx)[0];
  const quietest = [...t].sort((a, b) => a.tx - b.tx)[0];
  const avg = (arr: { tx: number }[]) => (arr.length ? Math.round(arr.reduce((s, d) => s + d.tx, 0) / arr.length) : 0);
  return {
    busiest,
    quietest,
    weekdayAvg: avg(t.filter((d) => d.dow >= 2 && d.dow <= 6)),
    weekendAvg: avg(t.filter((d) => d.dow === 1 || d.dow === 7)),
  };
});
// 시간대 구간(아침/점심/오후/저녁/심야) 거래·매출 비중
const BANDS: { key: string; label: string; hrs: number[] }[] = [
  { key: '아침', label: '아침 06–10', hrs: [6, 7, 8, 9, 10] },
  { key: '점심', label: '점심 11–13', hrs: [11, 12, 13] },
  { key: '오후', label: '오후 14–16', hrs: [14, 15, 16] },
  { key: '저녁', label: '저녁 17–20', hrs: [17, 18, 19, 20] },
  { key: '심야', label: '심야 21–05', hrs: [21, 22, 23, 0, 1, 2, 3, 4, 5] },
];
const bandStats = computed(() => {
  const cells = heat.value?.cells ?? [];
  const totalTx = cells.reduce((s, c) => s + c.tx, 0) || 1;
  return BANDS.map((b) => {
    const set = new Set(b.hrs);
    const inBand = cells.filter((c) => set.has(c.hour));
    const tx = inBand.reduce((s, c) => s + c.tx, 0);
    const rev = inBand.reduce((s, c) => s + c.revenue, 0);
    return { key: b.key, label: b.label, tx, rev, share: Math.round((tx / totalTx) * 1000) / 10 };
  });
});
const maxBandTx = computed(() => Math.max(1, ...bandStats.value.map((b) => b.tx)));
// 피크 집중도: 피크 시간 거래량이 평균의 몇 배인지
const concentration = computed(() => {
  const cells = heat.value?.cells ?? [];
  if (!cells.length) return null;
  const avg = cells.reduce((s, c) => s + c.tx, 0) / cells.length;
  return avg > 0 ? Math.round(((heat.value?.maxTx ?? 0) / avg) * 10) / 10 : null;
});
function liftLabel(l: number): { text: string; cls: string } {
  if (l >= 1.2) return { text: '연관 강함', cls: 'strong' };
  if (l >= 1.0) return { text: '연관 있음', cls: 'mid' };
  return { text: '연관 약함', cls: 'weak' };
}

async function load(): Promise<void> {
  loading.value = true;
  lastError.value = null;
  try {
    const [h, b] = await Promise.all([salesPatternsApi.heatmap(storeId.value), salesPatternsApi.basket(storeId.value)]);
    heat.value = h;
    basket.value = b;
  } catch (err: any) {
    lastError.value = err?.message ?? 'failed';
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="sp-view">
    <header class="page-header">
      <div>
        <h2>판매 패턴 분석</h2>
        <p class="subtitle">점포 #{{ storeId }} · 최근 {{ heat?.windowDays ?? 30 }}일 · 언제·무엇과 함께 팔리는지 진단</p>
      </div>
      <button class="ghost" :disabled="loading" @click="load">새로고침</button>
    </header>

    <p v-if="lastError" class="error">{{ lastError }}</p>
    <div v-if="loading" class="loading">불러오는 중…</div>

    <template v-else>
      <!-- ① 요일 × 시간대 피크 히트맵 -->
      <section class="card">
        <div class="card-header">
          <h3>🗓️ 요일 × 시간대 피크 히트맵</h3>
          <span class="peak-chip">가장 붐비는 시간 · <b>{{ peakText }}</b></span>
        </div>
        <div v-if="heat && heat.cells.length" class="heat-wrap">
          <table class="heat-table">
            <thead>
              <tr>
                <th class="corner"></th>
                <th v-for="h in HOURS" :key="h" class="hcol">{{ h }}</th>
                <th class="rowsum-h">합계</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dow in DOW_ORDER" :key="dow">
                <th class="dlabel" :class="{ wknd: dow === 1 || dow === 7 }">{{ DOW_LABEL[dow] }}</th>
                <td
                  v-for="h in HOURS"
                  :key="h"
                  class="hcell"
                  :class="{ peak: heat.peak && heat.peak.dow === dow && heat.peak.hour === h }"
                  :style="{ background: heatColor(cellAt(dow, h)?.tx ?? 0), color: heatText(cellAt(dow, h)?.tx ?? 0) }"
                  :title="`${DOW_LABEL[dow]}요일 ${ampm(h)} · 거래 ${cellAt(dow, h)?.tx ?? 0}건 · 매출 ${won(cellAt(dow, h)?.revenue ?? 0)}`"
                >{{ cellAt(dow, h)?.tx || '' }}</td>
                <td class="rowsum">
                  <span class="rowsum-bar" :style="{ width: `${((heat.dowTotals.find((d) => d.dow === dow)?.tx ?? 0) / maxDowTotal) * 100}%` }"></span>
                  <span class="rowsum-val">{{ heat.dowTotals.find((d) => d.dow === dow)?.tx ?? 0 }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="heat-legend"><span>한산</span><span class="legend-bar"></span><span>혼잡</span><span class="legend-cap">숫자 = 해당 시간대 거래 건수 · 셀에 마우스를 올리면 매출까지 표시</span></div>
        </div>
        <div v-else class="empty">기간 내 거래 데이터가 없습니다.</div>
      </section>

      <!-- 피크 데이터 운영 활용 -->
      <section v-if="heat && heat.cells.length" class="card">
        <div class="card-header">
          <h3>📌 피크 데이터 운영 활용</h3>
          <span v-if="concentration" class="peak-chip">피크 집중도 <b>평균의 {{ concentration }}배</b></span>
        </div>
        <p class="use-intro">‘언제 붐비는가’를 인력 배치·발주/보충·청소·프로모션 <b>타이밍 결정</b>으로 연결한 운영 가이드입니다.</p>

        <div class="use-grid">
          <div class="use-col peak">
            <div class="use-col-head">🔴 피크 시간대 — 집중 대응</div>
            <ul class="slot-list">
              <li v-for="c in topBusy" :key="'b' + c.dow + '-' + c.hour">
                <span class="slot-when">{{ slotLabel(c.dow, c.hour) }}</span>
                <span class="slot-tx">거래 {{ c.tx }}건 · {{ won(c.revenue) }}</span>
              </li>
            </ul>
            <p class="use-rec">권장: 인력 보강·계산 회전 강화, <b>피크 직전</b> 인기상품(삼각김밥·음료·도시락) 사전 보충, 충동구역 진열 채우기.</p>
          </div>
          <div class="use-col idle">
            <div class="use-col-head">🔵 한산 시간대 — 유휴 활용</div>
            <ul class="slot-list">
              <li v-for="c in topIdle" :key="'i' + c.dow + '-' + c.hour">
                <span class="slot-when">{{ slotLabel(c.dow, c.hour) }}</span>
                <span class="slot-tx">거래 {{ c.tx }}건</span>
              </li>
            </ul>
            <p class="use-rec">권장: 입고·청소·재고정리·발주 작업 배치, 한가한 시간대 <b>타임세일</b>로 수요 분산.</p>
          </div>
        </div>

        <p v-if="dayStats" class="day-insight">
          📅 가장 바쁜 요일 <b>{{ DOW_LABEL[dayStats.busiest.dow] }}</b>({{ dayStats.busiest.tx }}건) ·
          가장 한가한 <b>{{ DOW_LABEL[dayStats.quietest.dow] }}</b>({{ dayStats.quietest.tx }}건) ·
          주중 일평균 {{ dayStats.weekdayAvg }}건 vs 주말 {{ dayStats.weekendAvg }}건
          <template v-if="dayStats.weekendAvg > dayStats.weekdayAvg"> — 주말 집중, 주말 인력·재고 강화 권장</template>
          <template v-else> — 주중 집중, 주중 운영에 무게</template>
        </p>

        <div class="band-block">
          <div class="band-title">시간대 구간별 거래 비중</div>
          <div v-for="b in bandStats" :key="b.key" class="band-row">
            <span class="band-label">{{ b.label }}</span>
            <span class="band-bar-wrap"><span class="band-bar" :style="{ width: `${(b.tx / maxBandTx) * 100}%` }"></span></span>
            <span class="band-val">{{ b.share }}% <small>({{ b.tx }}건)</small></span>
          </div>
        </div>
      </section>

      <!-- ② 장바구니 연관분석 -->
      <section class="card">
        <div class="card-header">
          <h3>🧺 장바구니 연관분석 — 함께 팔리는 상품</h3>
          <span v-if="basket" class="peak-chip">
            총 {{ basket.totalBaskets.toLocaleString() }}바구니 · 평균 <b>{{ basket.avgBasketSize }}</b>품목 · 복수구매 <b>{{ basket.multiItemPct }}%</b>
          </span>
        </div>
        <div v-if="basket && basket.pairs.length" class="basket-wrap">
          <table class="basket-table">
            <thead>
              <tr><th>#</th><th>함께 구매한 상품</th><th>동시구매</th><th>신뢰도</th><th>향상도(lift)</th><th>연관</th></tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in basket.pairs" :key="p.p1 + '-' + p.p2">
                <td class="rk">{{ i + 1 }}</td>
                <td class="pair">
                  <span class="pchip">{{ p.name1 }}</span><span class="plus">+</span><span class="pchip">{{ p.name2 }}</span>
                </td>
                <td class="num">{{ p.pairCount }}회</td>
                <td class="num">
                  {{ p.confidence1to2Pct }}%
                  <small>· {{ p.confidence2to1Pct }}%</small>
                </td>
                <td class="num"><b>{{ p.lift.toFixed(2) }}</b></td>
                <td><span class="lift-tag" :data-l="liftLabel(p.lift).cls">{{ liftLabel(p.lift).text }}</span></td>
              </tr>
            </tbody>
          </table>
          <p class="basket-hint">
            💡 <b>향상도(lift)가 1보다 큰 조합</b>은 우연 이상으로 함께 팔립니다 — 인접 진열·세트 할인·교차 추천에 활용하세요.
            신뢰도는 ‘앞 상품 구매자 중 뒤 상품도 산 비율(· 뒤는 반대 방향)’입니다.
          </p>
        </div>
        <div v-else class="empty">동시구매 데이터가 충분하지 않습니다.</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sp-view { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { color: #64748d; font-size: 0.9rem; margin: 0.2rem 0 0; }
.card { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px; padding: 1rem 1.1rem; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.85rem; }
.card-header h3 { margin: 0; font-size: 1.02rem; }
.peak-chip { font-size: 0.82rem; color: #64748b; }
.peak-chip b { color: #4434d4; }
button.ghost { background: #fff; border: 1px solid #cdd7e3; border-radius: 6px; padding: 0.4rem 0.8rem; cursor: pointer; font-size: 0.85rem; }
.error { color: #dc2626; } .empty, .loading { color: #8a99af; font-size: 0.9rem; padding: 1rem; text-align: center; }

/* 히트맵 */
.heat-wrap { overflow-x: auto; }
.heat-table { border-collapse: collapse; width: 100%; min-width: 680px; }
.heat-table th.hcol { font-size: 0.62rem; font-weight: 600; color: #94a3b8; padding: 0 0 4px; text-align: center; }
.heat-table th.corner, .heat-table th.rowsum-h { font-size: 0.66rem; color: #94a3b8; }
.heat-table th.rowsum-h { text-align: left; padding-left: 8px; }
.dlabel { font-size: 0.74rem; font-weight: 700; color: #475569; padding-right: 8px; text-align: right; width: 1.6rem; }
.dlabel.wknd { color: #dc2626; }
.hcell {
  width: 24px; height: 24px; text-align: center; vertical-align: middle;
  font-size: 0.6rem; font-weight: 700; border: 1px solid #fff; border-radius: 4px;
  transition: transform 0.1s ease;
}
.hcell:hover { transform: scale(1.25); position: relative; z-index: 2; outline: 1px solid #533afd; }
.hcell.peak { outline: 2px solid #ef4444; outline-offset: -1px; }
.rowsum { padding-left: 8px; min-width: 90px; }
.rowsum-bar { display: inline-block; height: 9px; background: linear-gradient(90deg, #a5b4fc, #533afd); border-radius: 5px; vertical-align: middle; }
.rowsum-val { font-size: 0.7rem; color: #475569; margin-left: 5px; font-variant-numeric: tabular-nums; }
.heat-legend { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.7rem; font-size: 0.74rem; color: #64748d; flex-wrap: wrap; }
.legend-bar { width: 90px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, hsl(250,30%,94%), hsl(250,80%,38%)); }
.legend-cap { color: #94a3b8; margin-left: 0.3rem; }

/* 피크 데이터 운영 활용 */
.use-intro { margin: 0 0 0.85rem; font-size: 0.86rem; color: #475569; }
.use-intro b { color: #4434d4; }
.use-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
.use-col { border: 1px solid #eef1f6; border-radius: 10px; padding: 0.8rem 0.9rem; }
.use-col.peak { border-left: 4px solid #ef4444; background: #fffafa; }
.use-col.idle { border-left: 4px solid #3b82f6; background: #f8fbff; }
.use-col-head { font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 0.55rem; }
.slot-list { list-style: none; margin: 0 0 0.6rem; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.slot-list li { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; font-size: 0.84rem; }
.slot-when { font-weight: 700; color: #1f2937; }
.slot-tx { color: #64748b; font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.use-rec { margin: 0; font-size: 0.78rem; color: #475569; line-height: 1.5; }
.use-rec b { color: #b91c1c; }
.use-col.idle .use-rec b { color: #1d4ed8; }
.day-insight { margin: 0.9rem 0 0; font-size: 0.82rem; color: #475569; background: #f6f9fc; border-radius: 8px; padding: 0.55rem 0.75rem; line-height: 1.5; }
.day-insight b { color: #4434d4; }
.band-block { margin-top: 0.9rem; }
.band-title { font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 0.5rem; }
.band-row { display: grid; grid-template-columns: 5.5rem 1fr 6.5rem; align-items: center; gap: 0.5rem; padding: 0.15rem 0; }
.band-label { font-size: 0.78rem; color: #475569; }
.band-bar-wrap { background: #eef1f6; border-radius: 5px; height: 12px; overflow: hidden; }
.band-bar { display: block; height: 100%; background: linear-gradient(90deg, #a5b4fc, #533afd); border-radius: 5px; }
.band-val { font-size: 0.78rem; color: #334155; text-align: right; font-variant-numeric: tabular-nums; }
.band-val small { color: #94a3b8; }
@media (max-width: 720px) { .use-grid { grid-template-columns: 1fr; } }

/* 장바구니 */
.basket-wrap { overflow-x: auto; }
.basket-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; min-width: 560px; }
.basket-table th, .basket-table td { padding: 0.5rem 0.55rem; border-bottom: 1px solid #eef3f8; text-align: left; }
.basket-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; font-size: 0.8rem; }
.basket-table .rk { color: #94a3b8; font-weight: 700; width: 1.6rem; }
.basket-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.basket-table .num small { color: #94a3b8; font-weight: 400; }
.pair { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
.pchip { background: #f1efff; color: #4434d4; border-radius: 999px; padding: 0.12rem 0.5rem; font-size: 0.8rem; font-weight: 600; }
.plus { color: #94a3b8; font-weight: 700; }
.lift-tag { font-size: 0.72rem; font-weight: 700; border-radius: 999px; padding: 0.12rem 0.5rem; }
.lift-tag[data-l='strong'] { background: #dcfce7; color: #15803d; }
.lift-tag[data-l='mid'] { background: #eef2ff; color: #4434d4; }
.lift-tag[data-l='weak'] { background: #f1f5f9; color: #94a3b8; }
.basket-hint { margin: 0.8rem 0 0; font-size: 0.8rem; color: #64748b; line-height: 1.55; }
.basket-hint b { color: #334155; }
</style>
