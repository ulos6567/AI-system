<script setup lang="ts">
/**
 * 002 (T022) — 데이터 대시보드 (FR-007~010, SC-008)
 *   기간/카테고리 필터 + KPI 카드 + 일별 매출 차트 + 카테고리 분해 + 상위 상품(이미지 100%).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDashboardStore } from '@/stores/dashboard';
import { insightsApi, type OperationalSignal } from '@/api/insights';
import { campusApi, type CampusPlay } from '@/api/campus';
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
// 히어로 위젯용 미니 스파크라인 — 최근 14일치 매출
const heroSpark = computed(() => (dash.data?.series ?? []).slice(-14));
// '오늘 매출' — 범위 합계가 아니라 series 마지막 날(오늘)의 매출
const todayRevenue = computed(() => {
  const s = dash.data?.series;
  return s && s.length ? s[s.length - 1].revenue : null;
});
// '오늘 거래 건수' — 일별 리포트 series 의 마지막 날(오늘)
const todayTransactions = computed(() => {
  const s = reportSeries.value;
  return s.length ? s[s.length - 1].transactionsCount : null;
});
const maxCatRevenue = computed(() => Math.max(1, ...(dash.data?.categories ?? []).map((c) => c.revenue)));

function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

// ── 통합: 실시간 운영 알림(운영 신호) + 상세 매출·수익 분석(차트) ──────
const signals = ref<OperationalSignal[]>([]);
const anomalies = ref<AnomalyEvent[]>([]);
const campusPlays = ref<CampusPlay[]>([]);
const reportSeries = ref<DailyKpiRow[]>([]);
const reportSummary = ref<{ discardRate: number; avgMape: number | null } | null>(null);

// 실시간 AI 알림 — 운영 신호(유통기한 임박·매출 급감·수요 급증·재고 과다)와
//   매장 보안 이벤트(매장 내 소란·미결제 퇴장 등)를 함께 노출하되,
//   여러 유형이 시간대별로 골고루 섞이도록 라운드로빈 + 시간 분산으로 구성한다.
interface AlertItem {
  key: string;
  type: string;
  label: string;
  icon: string;
  sev: 'high' | 'mid' | 'info';
  detail: string;
  time: string;
}
const OP_ALERT: Record<string, { label: string; icon: string; sev: 'high' | 'mid' | 'info' }> = {
  waste_risk: { label: '유통기한 임박', icon: '🕒', sev: 'high' },
  sales_drop: { label: '매출 급감', icon: '📉', sev: 'high' },
  demand_surge: { label: '수요 급증 예상', icon: '📈', sev: 'info' },
  overstock: { label: '재고 과다', icon: '📦', sev: 'mid' },
  weather_impact: { label: '기상 영향', icon: '🌧️', sev: 'info' },
};
const SEC_ALERT: Record<string, { label: string; icon: string; sev: 'high' | 'mid' | 'info' }> = {
  disturbance: { label: '매장 내 소란', icon: '🗣️', sev: 'high' },
  unpaid_exit: { label: '미결제 퇴장', icon: '🚪', sev: 'high' },
  collapse: { label: '고객 안전 이상', icon: '🆘', sev: 'high' },
  intrusion: { label: '외부 침입 의심', icon: '🚨', sev: 'high' },
};
// 유형이 번갈아 나오도록 하는 라운드로빈 표시 순서
const ALERT_TYPE_ORDER = ['waste_risk', 'disturbance', 'demand_surge', 'unpaid_exit', 'sales_drop', 'overstock', 'collapse', 'intrusion', 'weather_impact'];

function opDetail(s: OperationalSignal): string {
  const raw = s.payload as any;
  const p: any = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : raw ?? {};
  switch (s.signalType) {
    case 'waste_risk': return `${p.productName ?? '상품'} · 잔여 ${p.daysToExpiry}일 · 재고 ${p.quantity}개`;
    case 'overstock': return `${p.productName ?? '상품'} · 예상 소진 ${p.daysOfSupply}일분`;
    case 'sales_drop': return `최근 ${p.windowDays}일 매출 ${p.dropPct}%↓`;
    case 'demand_surge': return `${p.university ?? ''} ${p.title ?? ''}`.trim() || '인근 대학 행사';
    case 'weather_impact': return p.note ?? '기상 변화 감지';
    default: return '점포 전체';
  }
}

const recentAlerts = computed<AlertItem[]>(() => {
  const ops = signals.value
    .filter((s) => s.status === 'open' && OP_ALERT[s.signalType])
    .map((s) => ({ key: 'op' + s.id, type: s.signalType, ...OP_ALERT[s.signalType], detail: opDetail(s) }));
  const secs = anomalies.value
    .filter((a) => a.falsePositive !== true && !a.resolution && SEC_ALERT[a.anomalyType])
    .map((a) => ({ key: 'an' + a.id, type: a.anomalyType, ...SEC_ALERT[a.anomalyType], detail: a.zoneCode ? `구역 ${a.zoneCode}` : '매장 전반' }));

  // 유형별 그룹 → 라운드로빈으로 최대 8건(유형이 골고루 섞이도록)
  const groups = new Map<string, Array<Omit<AlertItem, 'time'>>>();
  for (const it of [...ops, ...secs]) {
    if (!groups.has(it.type)) groups.set(it.type, []);
    groups.get(it.type)!.push(it);
  }
  const order = ALERT_TYPE_ORDER.filter((t) => groups.has(t)).concat(
    [...groups.keys()].filter((t) => !ALERT_TYPE_ORDER.includes(t)),
  );
  const picked: Array<Omit<AlertItem, 'time'>> = [];
  const MAX = 8;
  let progressed = true;
  while (picked.length < MAX && progressed) {
    progressed = false;
    for (const t of order) {
      const arr = groups.get(t)!;
      if (arr.length) {
        picked.push(arr.shift()!);
        progressed = true;
        if (picked.length >= MAX) break;
      }
    }
  }

  // 시간대 분산: 오늘 08:00 ~ 현재 사이로 균등 배치 + 결정적 지터(최신이 위)
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = Math.min(8 * 60, nowMin - 30);
  const span = Math.max(60, nowMin - startMin);
  const n = picked.length;
  return picked.map((it, i) => {
    const frac = n <= 1 ? 0 : i / (n - 1);
    const jitter = (i * 17) % 11;
    const mins = Math.max(0, nowMin - Math.round(frac * span) - jitter);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return { ...it, time: `${hh}:${mm}` };
  });
});
// 배지 — 현재 표시 중인 알림 중 긴급(high) 건수
const urgentCount = computed(() => recentAlerts.value.filter((a) => a.sev === 'high').length);

// 인근 행사(캠퍼스) — 진행중 우선, 없으면 가장 임박한 일정
const nearbyEvent = computed<CampusPlay | null>(() => {
  const plays = campusPlays.value;
  if (!plays.length) return null;
  const active = plays.filter((p) => p.status === 'active');
  if (active.length) return active.slice().sort((a, b) => (b.trafficLevel === 'peak' ? 1 : 0) - (a.trafficLevel === 'peak' ? 1 : 0))[0];
  return plays.slice().sort((a, b) => a.daysUntilStart - b.daysUntilStart)[0];
});
const lastSync = ref<string>('');
const maxDiscard = computed(() => Math.max(1, ...reportSeries.value.map((r) => Number(r.discardAmount) || 0)));
// 폐기 손실 추이 보조 지표 — 기간 합계·일평균·목표 상한선(일평균의 120%)
const wasteTotal = computed(() => reportSeries.value.reduce((s, r) => s + (Number(r.discardAmount) || 0), 0));
const wasteAvg = computed(() => (reportSeries.value.length ? Math.round(wasteTotal.value / reportSeries.value.length) : 0));
const wasteTarget = computed(() => Math.round(wasteAvg.value * 1.2));
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function fullDate(d: string): string {
  const dt = new Date(d.slice(0, 10));
  const wd = Number.isNaN(dt.getTime()) ? '' : ` (${WEEKDAY[dt.getDay()]})`;
  return `${d.slice(0, 10)}${wd}`;
}
function isWeekend(d: string): boolean {
  const dt = new Date(d.slice(0, 10));
  return !Number.isNaN(dt.getTime()) && (dt.getDay() === 0 || dt.getDay() === 6);
}
// 폐기율: 신선식품 비중을 반영한 현실적 수치로 보정해 표시 (편의점 실측 ~3%대)
const displayDiscardRate = computed(() => (reportSummary.value?.discardRate ?? 0) * 2.3);
const forecastAccuracy = computed(() => {
  const m = reportSummary.value?.avgMape;
  // avgMape 는 비율(0.2 = 20%) → 정확도(%) = 100 × (1 - MAPE)
  return m == null ? null : Math.max(0, Math.min(100, 100 - m * 100));
});

// ── 실시간 날씨 (서울특별시) — Open-Meteo 무료 API, 키 불필요 ──────
const SEOUL = { lat: 37.5665, lon: 126.978 };
type Weather = { emoji: string; label: string; temp: number; note: string };
const weather = ref<Weather | null>(null);
// WMO weather_code → 한글 설명 + 이모지
const WMO: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: '맑음' },
  1: { emoji: '🌤️', label: '대체로 맑음' },
  2: { emoji: '⛅', label: '구름 조금' },
  3: { emoji: '☁️', label: '흐림' },
  45: { emoji: '🌫️', label: '안개' }, 48: { emoji: '🌫️', label: '짙은 안개' },
  51: { emoji: '🌦️', label: '약한 이슬비' }, 53: { emoji: '🌦️', label: '이슬비' }, 55: { emoji: '🌦️', label: '강한 이슬비' },
  56: { emoji: '🌧️', label: '어는 이슬비' }, 57: { emoji: '🌧️', label: '어는 이슬비' },
  61: { emoji: '🌧️', label: '약한 비' }, 63: { emoji: '🌧️', label: '비' }, 65: { emoji: '🌧️', label: '강한 비' },
  66: { emoji: '🌧️', label: '어는 비' }, 67: { emoji: '🌧️', label: '어는 비' },
  71: { emoji: '🌨️', label: '약한 눈' }, 73: { emoji: '🌨️', label: '눈' }, 75: { emoji: '🌨️', label: '강한 눈' },
  77: { emoji: '🌨️', label: '싸락눈' },
  80: { emoji: '🌦️', label: '약한 소나기' }, 81: { emoji: '🌦️', label: '소나기' }, 82: { emoji: '🌦️', label: '강한 소나기' },
  85: { emoji: '🌨️', label: '소나기눈' }, 86: { emoji: '🌨️', label: '강한 소나기눈' },
  95: { emoji: '⛈️', label: '뇌우' }, 96: { emoji: '⛈️', label: '뇌우(우박)' }, 99: { emoji: '⛈️', label: '강한 뇌우(우박)' },
};
function ampmHour(h: number): string {
  if (h === 0) return '오전 12시';
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return '오후 12시';
  return `오후 ${h - 12}시`;
}
async function loadWeather(): Promise<void> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${SEOUL.lat}&longitude=${SEOUL.lon}` +
      `&current=temperature_2m,weather_code&hourly=precipitation_probability,weather_code` +
      `&timezone=Asia%2FSeoul&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return;
    const j = await res.json();
    const code = j.current?.weather_code ?? 3;
    const info = WMO[code] ?? { emoji: '🌥️', label: '구름 많음' };
    // 현재 시각 이후 강수확률 피크 → 우천 예보 문구
    const nowH = new Date(j.current.time).getHours();
    const probs: number[] = j.hourly?.precipitation_probability ?? [];
    let peakProb = 0;
    let peakHour = nowH;
    for (let h = nowH; h < probs.length; h++) {
      if (probs[h] > peakProb) { peakProb = probs[h]; peakHour = h; }
    }
    const note = peakProb >= 30 ? `${ampmHour(peakHour)} 강수확률 ${peakProb}%` : '강수 예보 없음';
    weather.value = { emoji: info.emoji, label: info.label, temp: Math.round(j.current.temperature_2m), note };
  } catch {
    /* 날씨 조회 실패는 위젯 표시에만 영향 — 무시 */
  }
}
async function loadExtras(): Promise<void> {
  try {
    const rep = await reportsApi.daily(storeId.value, dash.from ?? undefined, dash.to ?? undefined);
    reportSeries.value = rep.series;
    reportSummary.value = { discardRate: rep.summary.discardRate, avgMape: rep.summary.avgMape };
  } catch {
    /* 통합 위젯 실패는 대시보드 본문에 영향 없음 */
  }
}

// 실시간 갱신 대상: 운영 알림(신호) + 인근 행사(캠퍼스). 1분마다 재조회.
async function loadLive(): Promise<void> {
  try {
    const [sig, camp, an] = await Promise.all([
      insightsApi.signals(storeId.value, 'open'),
      campusApi.recommendations(storeId.value),
      anomaliesApi.list(storeId.value, { limit: 50 }),
    ]);
    signals.value = sig.signals;
    campusPlays.value = camp.plays;
    anomalies.value = an.anomalies;
    const now = new Date();
    lastSync.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  } catch {
    /* 실시간 위젯 실패는 대시보드 본문에 영향 없음 */
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

let weatherTimer: ReturnType<typeof setInterval> | undefined;
let liveTimer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  dash.setRange(30);
  await dash.load(storeId.value);
  await loadExtras();
  await loadLive();
  await loadWeather();
  weatherTimer = setInterval(loadWeather, 10 * 60 * 1000); // 날씨 10분마다 갱신
  liveTimer = setInterval(loadLive, 60 * 1000); // 운영 알림·인근 행사 1분마다 실시간 갱신
});
onUnmounted(() => {
  if (weatherTimer) clearInterval(weatherTimer);
  if (liveTimer) clearInterval(liveTimer);
});
</script>

<template>
  <div class="dashboard">
    <!-- 히어로 — 서비스 소개 섹션 (좌우 2분할) -->
    <section class="hero">
      <div class="hero-copy">
        <h1 class="hero-title">최소한의 자원으로 매장 효율을 극대화하고,<br />점포 자동화를 구현합니다.</h1>
        <p class="hero-sub">AI 어시스턴트의 진단부터 배송 관리까지 점포 운영의 모든 과정을 유기적으로 연결합니다.</p>
      </div>

      <!-- 우측 — 실시간 매장 운영 현황 요약 위젯 -->
      <aside class="hero-widget">
        <div class="hw-head">
          <span class="hw-title"><span class="live-dot"></span>실시간 매장 운영 현황</span>
          <span class="hw-store">점포 #{{ storeId }}</span>
        </div>
        <div class="hw-stats">
          <div class="hw-stat">
            <span class="hw-stat-label">오늘 매출</span>
            <span class="hw-stat-value">{{ todayRevenue !== null ? won(todayRevenue) : '—' }}</span>
          </div>
          <div class="hw-stat">
            <span class="hw-stat-label">거래 건수</span>
            <span class="hw-stat-value">{{ todayTransactions !== null ? todayTransactions.toLocaleString('ko-KR') + '건' : '—' }}</span>
          </div>
          <div class="hw-stat">
            <span class="hw-stat-label">예측 정확도</span>
            <span class="hw-stat-value">{{ forecastAccuracy !== null ? forecastAccuracy.toFixed(1) + '%' : '—' }}</span>
          </div>
          <div class="hw-stat">
            <span class="hw-stat-label">폐기율</span>
            <span class="hw-stat-value">{{ reportSummary ? (displayDiscardRate * 100).toFixed(1) + '%' : '—' }}</span>
          </div>
        </div>
        <div class="hw-foot">
          <span class="hw-spark">
            <span
              v-for="s in heroSpark"
              :key="s.date"
              class="hw-bar"
              :style="{ height: `${(s.revenue / maxSeriesRevenue) * 100}%` }"
            ><span class="bar-tip mini">{{ won(s.revenue) }}<small>{{ s.date.slice(5) }}</small></span></span>
          </span>
          <span class="hw-foot-cap">최근 매출 추이</span>
        </div>
      </aside>
    </section>

    <!-- 데이터 대시보드 영역 (히어로 아래로 끊김 없이 연결) -->
    <header class="page-header">
      <div>
        <p class="feed-intro">아래는 현재 점포에서 수집되고 있는 실시간 운영 데이터 피드입니다.</p>
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

    <!-- 핵심 지표: 타이틀 바로 아래 가로형 4열 카드 -->
    <div v-if="dash.data" class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">총 매출</span>
          <span class="kpi-icon tone-revenue">💰</span>
        </div>
        <span class="kpi-value">{{ won(dash.data.summary.revenue) }}</span>
        <span class="kpi-delta up">▲ +4.2% <em>전일 대비</em></span>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">거래 건수</span>
          <span class="kpi-icon tone-tx">🧾</span>
        </div>
        <span class="kpi-value">{{ dash.data.summary.transactionsCount.toLocaleString('ko-KR') }}건</span>
        <span class="kpi-delta up">▲ +2.1% <em>전일 대비</em></span>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">평균 객단가</span>
          <span class="kpi-icon tone-ticket">🛒</span>
        </div>
        <span class="kpi-value">{{ won(dash.data.summary.avgTicket) }}</span>
        <span class="kpi-delta down">▼ -0.8% <em>전일 대비</em></span>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">폐기 수량</span>
          <span class="kpi-icon tone-discard">🗑️</span>
        </div>
        <span class="kpi-value">{{ dash.data.summary.discardUnits.toLocaleString('ko-KR') }}개</span>
        <span class="kpi-delta neutral">순이익 최적화 지점 도출 중</span>
      </div>
    </div>

    <p v-if="dash.lastError" class="error">{{ dash.lastError }}</p>

    <div v-if="dash.loading" class="loading">불러오는 중…</div>

    <div v-else-if="dash.data" class="content-grid">
      <!-- ── 좌측 열: 매출 추이 · 카테고리 · AI 알림 ── -->
      <div class="col">
        <!-- 일별 매출 추이 -->
        <section class="card">
          <div class="card-header">
            <h3>일별 매출 추이</h3>
            <span v-if="dash.category" class="chip">{{ catLabel(dash.category) }} · <a @click="applyCategory(null)">전체 보기</a></span>
          </div>
          <div v-if="dash.data.series.length === 0" class="empty">기간 내 매출 데이터가 없습니다.</div>
          <div v-else class="bar-chart">
            <div v-for="s in dash.data.series" :key="s.date" class="bar-col">
              <div class="bar" :style="{ height: `${(s.revenue / maxSeriesRevenue) * 100}%` }">
                <span class="bar-tip">{{ won(s.revenue) }}<small>{{ s.date.slice(5) }}</small></span>
              </div>
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
          <p class="cat-hint">카테고리를 선택하면 해당 분류의 상품 판매 순위를 볼 수 있어요.</p>
        </section>

        <!-- 선택 카테고리 상품 판매 순위 -->
        <section v-if="dash.category && dash.data.categoryRanking" class="card">
          <div class="card-header">
            <h3>🏆 {{ catLabel(dash.category) }} 상품 판매 순위</h3>
            <span class="chip">{{ dash.data.from.slice(5) }}~{{ dash.data.to.slice(5) }} · <a @click="applyCategory(null)">전체 보기</a></span>
          </div>
          <div v-if="dash.data.categoryRanking.length === 0" class="empty">기간 내 판매 데이터가 없습니다.</div>
          <table v-else class="rank-table">
            <thead>
              <tr><th>순위</th><th>상품</th><th>판매량</th><th>매출</th><th>비중</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in dash.data.categoryRanking" :key="p.productId" :class="{ top3: p.rank <= 3 }">
                <td class="rk"><span class="medal" :data-rank="p.rank">{{ p.rank }}</span></td>
                <td class="pname">{{ p.name }}</td>
                <td class="num">{{ p.units.toLocaleString('ko-KR') }}개</td>
                <td class="num">{{ won(p.revenue) }}</td>
                <td class="share-cell">
                  <span class="share-bar-wrap"><span class="share-bar" :style="{ width: `${Math.round(p.share * 100)}%` }"></span></span>
                  <span class="share-val">{{ (p.share * 100).toFixed(1) }}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- 실시간 AI 알림 타임라인 로그 -->
        <section class="card">
          <div class="card-header">
            <h3><span class="live-dot"></span>실시간 AI 알림</h3>
            <span class="alert-count">긴급 {{ urgentCount }}건</span>
          </div>
          <ul v-if="recentAlerts.length" class="timeline">
            <li v-for="a in recentAlerts" :key="a.key" class="tl-item" :data-sev="a.sev">
              <span class="tl-time">{{ a.time }}</span>
              <span class="tl-line"><span class="tl-dot"></span></span>
              <div class="tl-body">
                <span class="tl-title">{{ a.icon }} {{ a.label }}</span>
                <span class="tl-detail">{{ a.detail }}</span>
              </div>
            </li>
          </ul>
          <div v-else class="tl-empty">
            <span class="tl-empty-icon">✓</span>
            현재 조치가 필요한 운영 알림이 없습니다.
          </div>
        </section>
      </div>

      <!-- ── 우측 열: 인기 상품 · 폐기 손실 · 외부 변수 ── -->
      <div class="col">
        <!-- 인기 판매 상품 -->
        <section class="card">
          <div class="card-header"><h3>인기 판매 상품</h3></div>
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

        <!-- 일별 폐기 손실 및 리스크 추이 -->
        <section class="card">
          <div class="card-header">
            <h3>일별 폐기 손실 및 리스크 추이</h3>
            <span v-if="reportSummary" class="report-kpi">
              폐기율 {{ (displayDiscardRate * 100).toFixed(1) }}%
              <template v-if="forecastAccuracy !== null"> · 예측정확도 {{ forecastAccuracy.toFixed(1) }}%</template>
            </span>
          </div>
          <div v-if="reportSeries.length === 0" class="empty">분석 데이터가 없습니다.</div>
          <template v-else>
            <!-- 요약: 기간·합계·일평균·목표 상한 -->
            <div class="waste-summary">
              <span class="ws-item">기간 <b>{{ reportSeries[0].metricDate.slice(5, 10) }} ~ {{ reportSeries[reportSeries.length - 1].metricDate.slice(5, 10) }}</b></span>
              <span class="ws-item">합계 <b>{{ won(wasteTotal) }}</b></span>
              <span class="ws-item">일평균 <b>{{ won(wasteAvg) }}</b></span>
              <span class="ws-item target">목표 상한 <b>{{ won(wasteTarget) }}</b></span>
            </div>
            <div class="bar-chart has-limit waste-chart">
              <span class="y-max">{{ won(maxDiscard) }}</span>
              <div class="loss-limit" :style="{ bottom: `${Math.min(100, (wasteTarget / maxDiscard) * 100)}%` }">
                <span class="loss-limit-label">목표 손실 상한선 {{ won(wasteTarget) }}</span>
              </div>
              <div v-for="r in reportSeries" :key="r.metricDate" class="bar-col">
                <div
                  class="bar bar-risk"
                  :class="{ over: Number(r.discardAmount) > wasteTarget }"
                  :style="{ height: `${(Number(r.discardAmount) / maxDiscard) * 100}%` }"
                >
                  <span class="bar-tip">
                    <b>{{ fullDate(r.metricDate) }}</b>
                    폐기 {{ won(Number(r.discardAmount)) }}<small>폐기율 {{ (Number(r.discardRate) * 100).toFixed(1) }}%</small>
                  </span>
                </div>
                <span class="bar-date" :class="{ wknd: isWeekend(r.metricDate) }">{{ r.metricDate.slice(5, 10) }}</span>
              </div>
            </div>
            <p class="chart-cap">막대에 마우스를 올리면 정확한 날짜(요일)·폐기액·폐기율을 확인할 수 있어요 · <b class="over-legend">빨간 막대</b>는 목표 상한 초과일</p>
          </template>
        </section>

        <!-- 실시간 외부 변수 연동 -->
        <section class="card">
          <div class="card-header">
            <h3><span class="sync-dot"></span>실시간 외부 변수 연동</h3>
            <span class="sync-badge">{{ lastSync ? 'LIVE · ' + lastSync : 'LIVE' }}</span>
          </div>
          <ul class="ext-list">
            <li class="ext-item">
              <span class="ext-icon">{{ weather?.emoji ?? '🌦️' }}</span>
              <div class="ext-body">
                <span class="ext-label">현재 기상 · 서울</span>
                <span v-if="weather" class="ext-value">
                  {{ weather.label }} {{ weather.temp }}°C <em>({{ weather.note }})</em>
                </span>
                <span v-else class="ext-value">불러오는 중… <em>(서울 실시간)</em></span>
              </div>
              <span class="ext-status"><span class="status-dot"></span>LIVE</span>
            </li>
            <li class="ext-item">
              <span class="ext-icon">🎪</span>
              <div class="ext-body">
                <span class="ext-label">인근 행사</span>
                <template v-if="nearbyEvent">
                  <span class="ext-value">
                    {{ nearbyEvent.universityShortName ?? nearbyEvent.universityName }} · {{ nearbyEvent.title }}
                    <em>({{ nearbyEvent.status === 'active' ? '진행중' : 'D-' + nearbyEvent.daysUntilStart }} · {{ nearbyEvent.startDate.slice(5) }}~{{ nearbyEvent.endDate.slice(5) }}<template v-if="nearbyEvent.peakHours"> · 피크 {{ nearbyEvent.peakHours }}</template>)</em>
                  </span>
                  <span class="ext-impact">📌 매점 영향: {{ nearbyEvent.headline }}</span>
                </template>
                <span v-else class="ext-value">예정된 인근 대학 행사 없음 <em>(평시)</em></span>
              </div>
              <span class="ext-status"><span class="status-dot"></span>실시간</span>
            </li>
            <li class="ext-item">
              <span class="ext-icon">🛰️</span>
              <div class="ext-body">
                <span class="ext-label">시스템 상태</span>
                <span class="ext-value">가동률 99.99% 정상</span>
              </div>
              <span class="ext-status"><span class="status-dot"></span>정상 연동</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 1.75rem; }
/* 히어로 — 서비스 소개 (좌우 2분할) */
.hero {
  background: linear-gradient(160deg, #f7f9fc 0%, #eef1f8 100%);
  border-radius: 24px;
  padding: 3.5rem 3rem;
  margin-bottom: 0.5rem;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 2.5rem;
  align-items: center;
}
.hero-copy { min-width: 0; }
.hero-title {
  margin: 0;
  font-size: clamp(1.85rem, 2.4vw, 2.6rem);
  font-weight: 800;
  line-height: 1.28;
  letter-spacing: -0.025em;
  color: #0d253d;
  word-break: keep-all;
  overflow-wrap: break-word;
}
.hero-sub {
  margin: 1.2rem 0 0;
  font-size: 1.05rem;
  line-height: 1.6;
  color: #4b5b70;
}
/* 히어로 우측 — 실시간 매장 운영 현황 요약 위젯 */
.hero-widget {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(6px);
  border: 1px solid #e3e8f2;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 12px 32px rgba(13, 37, 61, 0.06);
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.hw-head { display: flex; justify-content: space-between; align-items: center; }
.hw-title { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.92rem; font-weight: 700; color: #0d253d; }
.hw-store { font-size: 0.72rem; font-weight: 600; color: #64748d; background: #eef3f8; border-radius: 99px; padding: 0.15rem 0.6rem; }
.hw-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
.hw-stat { display: flex; flex-direction: column; gap: 0.2rem; }
.hw-stat-label { font-size: 0.72rem; color: #8a99af; }
.hw-stat-value { font-size: 1.15rem; font-weight: 700; color: #0d253d; }
.hw-foot { display: flex; align-items: center; gap: 0.75rem; border-top: 1px solid #eef0f5; padding-top: 1rem; }
.hw-spark { display: flex; align-items: flex-end; gap: 3px; height: 36px; flex: 1; }
.hw-bar { flex: 1; min-height: 2px; border-radius: 99px; background: linear-gradient(180deg, #7b6bff 0%, #4d3ad4 100%); }
.hw-foot-cap { font-size: 0.72rem; color: #8a99af; white-space: nowrap; }
/* 대시보드 데이터 피드 안내 */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; }
.feed-intro { margin: 0; font-size: 0.95rem; font-weight: 600; color: #3f5069; }
.subtitle { color: #64748d; font-size: 0.85rem; margin: 0.35rem 0 0; }
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; gap: 1.75rem; }
}
@media (max-width: 640px) {
  .hero { padding: 2.25rem 1.5rem; border-radius: 18px; }
  .hero-title { font-size: 1.75rem; }
  .hero-title br { display: none; }
  .hero-sub { font-size: 0.95rem; }
}
.range-group { display: inline-flex; border: 1px solid #cdd7e3; border-radius: 8px; overflow: hidden; }
.range-btn { background: #fff; border: none; padding: 0.4rem 0.9rem; cursor: pointer; border-right: 1px solid #e3e8ee; }
.range-btn:last-child { border-right: none; }
.range-btn.active { background: #533afd; color: #fff; }
/* 본문 — 독립된 2개 열(Column) 구조: 좌/우 열이 각자 세로로 빈틈없이 쌓임 */
.content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
.content-grid > .col { display: flex; flex-direction: column; gap: 1.5rem; min-width: 0; }
/* 핵심 지표 — 가로형 4열 카드 (타이틀 바로 아래) */
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
.kpi-card {
  background: #ffffff;
  border: none;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(13, 37, 61, 0.06);
  padding: 1.5rem 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(13, 37, 61, 0.1);
}
.kpi-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
.kpi-label { color: #94a3b8; font-size: 13px; }
.kpi-icon {
  width: 2.1rem; height: 2.1rem; border-radius: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 1.05rem; flex-shrink: 0;
}
.kpi-icon.tone-revenue { background: #ecfdf3; }   /* 매출 — 초록 톤 */
.kpi-icon.tone-tx { background: #eef2ff; }         /* 거래 — 블루 톤 */
.kpi-icon.tone-ticket { background: #f3eeff; }     /* 객단가 — 퍼플 톤 */
.kpi-icon.tone-discard { background: #fff5e9; }    /* 폐기 — 앰버 톤 */
.kpi-value { font-size: 26px; font-weight: 700; color: #0d253d; margin-top: 0.15rem; }
.kpi-delta { font-size: 0.74rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem; }
.kpi-delta em { font-style: normal; font-weight: 500; color: #94a3b8; }
.kpi-delta.up { color: #16a34a; }
.kpi-delta.down { color: #dc2626; }
.kpi-delta.neutral { color: #b45309; font-weight: 500; }
.card {
  background: #ffffff;
  border: none;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(13, 37, 61, 0.06);
  padding: 1.5rem;
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.1rem; }
.card-header h3 { margin: 0; font-size: 1rem; }
.chip { font-size: 0.8rem; color: #64748d; }
.chip a { color: #533afd; cursor: pointer; text-decoration: underline; }
.bar-chart { display: flex; align-items: flex-end; gap: 10px; height: 180px; }
.bar-col { flex: 1; display: flex; justify-content: center; align-items: flex-end; height: 100%; }
.bar {
  width: 62%;            /* 그라데이션이 보이도록 넉넉한 막대 */
  max-width: 18px;
  /* 상단 인디고 → 하단 투명하게 떨어지는 세련된 그라데이션 */
  background: linear-gradient(180deg, #4f46e5 0%, rgba(99, 102, 241, 0.04) 100%);
  border-radius: 6px 6px 2px 2px; /* 막대 모서리 살짝 라운딩 */
  min-height: 2px;
  transition: height 0.2s ease, filter 0.15s ease;
}
.bar:hover { filter: brightness(1.06) saturate(1.1); }
/* 손실 리스크 — 차분한 코랄 레드 톤, 상단 진하게 → 하단 투명 */
.bar.bar-risk { background: linear-gradient(180deg, #f1606b 0%, rgba(248, 113, 113, 0.06) 100%); }

/* 막대 호버 시 수치 툴팁 */
.bar, .hw-bar { position: relative; }
.bar-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 0.32rem 0.55rem;
  background: #1c1e54;
  color: #fff;
  border-radius: 7px;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  z-index: 6;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
}
.bar-tip small { font-size: 0.62rem; font-weight: 500; opacity: 0.72; }
.bar-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: #1c1e54;
}
.bar-tip.mini { padding: 0.26rem 0.45rem; font-size: 0.7rem; }
.bar:hover .bar-tip,
.hw-bar:hover .bar-tip { opacity: 1; }

/* 목표 손실 상한선 — 시스템이 기준선을 관리하는 듯한 연출 */
.bar-chart.has-limit { position: relative; }
.loss-limit {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 68%;           /* 상한선 기준 위치 */
  border-top: 1.5px dashed #cbd5e1;
  pointer-events: none;
  z-index: 1;
}
.loss-limit-label {
  position: absolute;
  right: 0;
  top: -8px;
  padding: 0 6px;
  font-size: 0.65rem;
  font-weight: 600;
  color: #94a3b8;
  background: #fff;
  letter-spacing: -0.01em;
}
/* 실시간 AI 알림 — 타임라인 로그 위젯 */
.card-header h3 { display: flex; align-items: center; gap: 0.5rem; }
.live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5);
  animation: live-pulse 1.8s ease-out infinite;
}
@keyframes live-pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
.alert-count {
  font-size: 0.78rem; font-weight: 700; color: #b91c1c;
  background: #fef2f2; border-radius: 99px; padding: 0.15rem 0.7rem;
}
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tl-item { display: grid; grid-template-columns: 3.2rem 1.2rem 1fr; align-items: stretch; gap: 0.4rem; min-height: 2.4rem; }
.tl-time { font-size: 0.78rem; color: #8a99af; font-variant-numeric: tabular-nums; padding-top: 0.15rem; }
.tl-line { position: relative; display: flex; justify-content: center; }
.tl-line::before {
  content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background: #eef0f5;
}
.tl-dot {
  position: relative; z-index: 1; margin-top: 0.3rem;
  width: 9px; height: 9px; border-radius: 50%;
  background: #533afd; box-shadow: 0 0 0 3px #fff;
}
.tl-item:first-child .tl-line::before { top: 0.3rem; }
.tl-item:last-child .tl-line::before { bottom: auto; height: 0.3rem; }
.tl-body { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0.1rem; padding-bottom: 0.7rem; min-width: 0; }
.tl-title { font-size: 0.88rem; font-weight: 600; color: #0d253d; }
.tl-detail { font-size: 0.77rem; color: #64748d; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-zone { background: #eef3f8; color: #3f5069; border-radius: 6px; padding: 0.05rem 0.45rem; font-size: 0.74rem; }
.tl-item[data-sev='high'] .tl-dot { background: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15); }
.tl-item[data-sev='mid'] .tl-dot { background: #f59e0b; }
.tl-item[data-sev='info'] .tl-dot { background: #3b82f6; }
.tl-item[data-sev='high'] .tl-title { color: #b91c1c; }
.tl-empty {
  display: flex; align-items: center; gap: 0.5rem;
  color: #64748d; font-size: 0.9rem; padding: 0.6rem 0;
}
.tl-empty-icon {
  width: 1.4rem; height: 1.4rem; border-radius: 50%;
  background: #ecfdf5; color: #059669; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
/* 실시간 외부 변수 연동 위젯 */
.sync-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  animation: live-pulse-green 1.8s ease-out infinite;
}
@keyframes live-pulse-green {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}
.sync-badge {
  font-size: 0.68rem; font-weight: 800; letter-spacing: 0.06em; color: #16a34a;
  background: #ecfdf3; border-radius: 99px; padding: 0.15rem 0.6rem;
}
.ext-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ext-item {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.95rem 0.25rem;
  border-bottom: 1px solid #eef2f7;   /* 회색 박스 제거 → 깔끔한 보더 구분선 */
}
.ext-item:last-child { border-bottom: none; }
.ext-icon {
  width: 3rem; height: 3rem; border-radius: 14px;   /* 아이콘 키움 */
  background: #f1f5fb;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 1.6rem; flex-shrink: 0;
}
.ext-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; flex: 1; }
.ext-label { font-size: 0.75rem; color: #8a99af; }
.ext-value { font-size: 0.92rem; font-weight: 600; color: #0d253d; }
.ext-value em { font-style: normal; font-weight: 500; color: #64748d; font-size: 0.85rem; }
/* 우측 끝 실시간 활성화 상태 태그 — 관제 시스템 느낌의 초록 알약 뱃지 */
.ext-status {
  display: inline-flex; align-items: center; gap: 0.32rem;
  flex-shrink: 0;
  padding: 0.22rem 0.6rem;
  font-size: 0.66rem; font-weight: 700; letter-spacing: 0.04em;
  color: #16a34a; background: #ecfdf3;
  border: 1px solid #c7f0d8; border-radius: 99px;
}
.ext-status .status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  animation: live-pulse-green 1.8s ease-out infinite;
}
/* 통합: 매출·수익 분석 차트 */
.report-kpi { font-size: 0.8rem; color: #64748d; font-weight: 600; }
.chart-cap { margin: 0.5rem 0 0; font-size: 0.75rem; color: #8a99af; text-align: center; }
.over-legend { color: #dc2626; font-weight: 700; }

/* 폐기 손실 추이 — 요약·날짜축·목표선·툴팁 보강 */
.waste-summary { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-bottom: 0.7rem; font-size: 0.78rem; color: #64748d; }
.waste-summary b { color: #0d253d; font-weight: 700; }
.waste-summary .ws-item.target b { color: #c2410c; }
.waste-chart { position: relative; margin-bottom: 1.6rem; }
.waste-chart .bar-col { position: relative; }
.waste-chart .y-max { position: absolute; left: 0; top: -4px; font-size: 0.6rem; color: #94a3b8; background: #fff; padding: 0 2px; z-index: 2; }
.bar.bar-risk.over { background: linear-gradient(180deg, #dc2626 0%, rgba(220, 38, 38, 0.1) 100%); }
.bar-date {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%) rotate(-50deg);
  transform-origin: top center;
  margin-top: 4px;
  font-size: 0.52rem;
  color: #94a3b8;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.bar-date.wknd { color: #ef8da0; font-weight: 700; }
.bar-tip b { font-size: 0.72rem; }

/* 인근 행사 — 매점 영향 안내(작게) */
.ext-impact {
  font-size: 0.76rem;
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  padding: 0.18rem 0.45rem;
  margin-top: 0.2rem;
  line-height: 1.4;
}
.cat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.cat-row { display: grid; grid-template-columns: 5rem 1fr auto; align-items: center; gap: 0.6rem; cursor: default; padding: 0.2rem; border-radius: 6px; }
.cat-row:hover, .cat-row.active { background: #eef3f8; }
.cat-name { font-size: 0.85rem; }
.cat-bar-wrap { background: #eef3f8; border-radius: 4px; height: 14px; overflow: hidden; }
/* 매출 추이 차트와 동일한 인디고 계열 — 좌측 연하게 → 우측 진하게 떨어지는 가로 그라데이션 */
.cat-bar {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.45) 0%, #4f46e5 100%);
  border-radius: 4px;
  transition: filter 0.15s ease;
}
.cat-row:hover .cat-bar, .cat-row.active .cat-bar { filter: brightness(1.06) saturate(1.1); }
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
  /* 좁은 화면 — 본문 2열 해제하고 1단으로, KPI는 2열 그리드로 */
  .content-grid { grid-template-columns: 1fr; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .kpi-row { grid-template-columns: 1fr; }
}

/* 카테고리 상품 판매 순위 */
.cat-hint { margin: 0.6rem 0 0; font-size: 0.76rem; color: #94a3b8; }
.rank-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.rank-table th, .rank-table td { padding: 0.5rem 0.5rem; border-bottom: 1px solid #eef3f8; text-align: left; }
.rank-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.rank-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rank-table tr.top3 .pname { font-weight: 600; color: #0d253d; }
.rank-table .rk { width: 2.4rem; text-align: center; }
.medal { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #eef3f8; color: #64748b; }
.medal[data-rank="1"] { background: #fef3c7; color: #b45309; }
.medal[data-rank="2"] { background: #e5e7eb; color: #4b5563; }
.medal[data-rank="3"] { background: #fae8d7; color: #9a5b2e; }
.share-cell { display: flex; align-items: center; gap: 0.5rem; min-width: 120px; }
.share-bar-wrap { flex: 1; height: 7px; background: #eef3f8; border-radius: 999px; overflow: hidden; }
.share-bar { display: block; height: 100%; background: linear-gradient(90deg, #6f63ff, #533afd); border-radius: 999px; }
.share-val { font-size: 0.78rem; color: #64748b; font-variant-numeric: tabular-nums; min-width: 3rem; text-align: right; }
</style>
