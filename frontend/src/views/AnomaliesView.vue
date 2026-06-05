<script setup lang="ts">
/**
 * 002 (T029) — 이상 알림·실시간 알림 화면 (FR-014~016, SC-005/006)
 *   목록 + SLA 통계 + 실시간 도착(전역 SSE 이벤트 감시) + 오탐 피드백/대응 결과.
 */
import { computed, onMounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAnomaliesStore } from '@/stores/anomalies';
import { useEventsStore } from '@/stores/events';
import type { AnomalyEvent } from '@/api/anomalies';

const auth = useAuthStore();
const anomalies = useAnomaliesStore();
const events = useEventsStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const TYPE_LABEL: Record<string, string> = {
  unpaid_exit: '미결제 퇴장',
  disturbance: '매장 소란',
  collapse: '고객 쓰러짐',
  intrusion: '비정상 침입',
};
const TYPE_ICON: Record<string, string> = {
  unpaid_exit: '🛒',
  disturbance: '🗣️',
  collapse: '🚑',
  intrusion: '🚪',
};

const open = computed(() => anomalies.items.filter((a) => a.falsePositive === null));
const reviewed = computed(() => anomalies.items.filter((a) => a.falsePositive !== null));

function sevClass(s: number): string {
  return s >= 4 ? 'crit' : s >= 3 ? 'warn' : 'info';
}
function fmt(ts: string | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function load(): Promise<void> {
  await anomalies.refresh(storeId.value);
}
async function simulate(): Promise<void> {
  await anomalies.simulate(storeId.value);
}
async function markFalse(a: AnomalyEvent): Promise<void> {
  await anomalies.feedback(storeId.value, a.id, { falsePositive: true, resolution: '오탐 처리' });
}
async function resolve(a: AnomalyEvent): Promise<void> {
  const r = window.prompt('대응 결과를 입력하세요', '현장 확인·정상 종료');
  if (r === null) return;
  await anomalies.feedback(storeId.value, a.id, { falsePositive: false, resolution: r });
}

// 전역 SSE 로 이상 이벤트가 도착하면 즉시 목록 새로고침(실시간 도달, SLA 시연)
watch(
  () => events.recentEvents[0]?.id,
  () => {
    const top = events.recentEvents[0];
    if (top && typeof top.eventType === 'string' && top.eventType.startsWith('anomaly')) {
      load();
    }
  },
);

onMounted(load);
</script>

<template>
  <div class="anomalies-view">
    <header class="page-header">
      <div>
        <h2>실시간 이상 신호 감지</h2>
        <p class="subtitle">점포 #{{ storeId }} · 실시간 감지 → 30초 내 알림 → 오탐 피드백</p>
      </div>
      <div class="actions">
        <button class="ghost" :disabled="anomalies.loading" @click="load">새로고침</button>
        <button v-if="auth.isAdmin" class="primary" @click="simulate">이벤트 주입(데모)</button>
      </div>
    </header>

    <p v-if="anomalies.lastError" class="error">{{ anomalies.lastError }}</p>

    <section class="sla-row" v-if="anomalies.sla">
      <div class="sla-card">
        <span class="sla-label">누적 감지</span>
        <span class="sla-value">{{ anomalies.sla.count }}건</span>
      </div>
      <div class="sla-card" :class="{ ok: anomalies.sla.maxDelaySec <= 30 }">
        <span class="sla-label">최대 알림 지연</span>
        <span class="sla-value">{{ anomalies.sla.maxDelaySec }}초 <small>(SLA ≤30초)</small></span>
      </div>
      <div class="sla-card">
        <span class="sla-label">미처리</span>
        <span class="sla-value">{{ open.length }}건</span>
      </div>
    </section>

    <section class="card">
      <div class="card-header"><h3>미처리 이상 ({{ open.length }})</h3></div>
      <div v-if="open.length === 0" class="empty">미처리 이상 이벤트가 없습니다.</div>
      <ul v-else class="ev-list">
        <li v-for="a in open" :key="a.id" class="ev-card" :data-sev="sevClass(a.severity)">
          <span class="ev-icon">{{ TYPE_ICON[a.anomalyType] }}</span>
          <div class="ev-body">
            <div class="ev-head">
              <span class="ev-type">{{ TYPE_LABEL[a.anomalyType] ?? a.anomalyType }}</span>
              <span class="ev-sev" :data-sev="sevClass(a.severity)">심각도 {{ a.severity }}</span>
              <span v-if="a.escalated" class="ev-escal">🚒 관제 전파</span>
            </div>
            <p class="ev-meta">구역 {{ a.zoneCode ?? '-' }} · 감지 {{ fmt(a.detectedAt) }} · 알림 {{ fmt(a.notifiedAt) }}</p>
            <div v-if="auth.isAdmin" class="ev-btns">
              <button class="ghost" @click="markFalse(a)">오탐</button>
              <button class="primary" @click="resolve(a)">대응 완료</button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section class="card">
      <div class="card-header"><h3>처리 이력</h3></div>
      <div v-if="reviewed.length === 0" class="empty">처리된 이벤트가 없습니다.</div>
      <table v-else class="hist-table">
        <thead><tr><th>유형</th><th>구역</th><th>감지</th><th>판정</th><th>대응</th></tr></thead>
        <tbody>
          <tr v-for="a in reviewed" :key="a.id">
            <td>{{ TYPE_LABEL[a.anomalyType] ?? a.anomalyType }}</td>
            <td>{{ a.zoneCode ?? '-' }}</td>
            <td>{{ fmt(a.detectedAt) }}</td>
            <td><span class="tag" :class="a.falsePositive ? 'fp' : 'ok'">{{ a.falsePositive ? '오탐' : '실제' }}</span></td>
            <td>{{ a.resolution ?? '-' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.anomalies-view { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
.subtitle { color: #64748d; font-size: 0.9rem; margin: 0.2rem 0 0; }
.actions { display: flex; gap: 0.5rem; }
.sla-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.sla-card { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
.sla-card.ok { border-color: #86efac; background: #f0fdf4; }
.sla-label { color: #64748d; font-size: 0.8rem; }
.sla-value { font-size: 1.2rem; font-weight: 700; color: #0d253d; }
.sla-value small { font-size: 0.7rem; color: #8a99af; font-weight: 500; }
.card { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px; padding: 1rem; }
.card-header { margin-bottom: 0.75rem; }
.card-header h3 { margin: 0; font-size: 1rem; }
.ev-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.ev-card { display: flex; gap: 0.75rem; border: 1px solid #e3e8ee; border-left: 4px solid #8a99af; border-radius: 8px; padding: 0.75rem; }
.ev-card[data-sev='crit'] { border-left-color: #ef4444; background: #fef2f2; }
.ev-card[data-sev='warn'] { border-left-color: #f59e0b; }
.ev-icon { font-size: 1.6rem; }
.ev-body { flex: 1; }
.ev-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.ev-type { font-weight: 700; }
.ev-sev { font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #e3e8ee; color: #3f5069; }
.ev-sev[data-sev='crit'] { background: #fee2e2; color: #b91c1c; }
.ev-sev[data-sev='warn'] { background: #fef3c7; color: #92400e; }
.ev-escal { font-size: 0.72rem; color: #b91c1c; font-weight: 700; }
.ev-meta { margin: 0.35rem 0; color: #64748d; font-size: 0.82rem; }
.ev-btns { display: flex; gap: 0.5rem; }
.hist-table { width: 100%; border-collapse: collapse; }
.hist-table th, .hist-table td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eef3f8; font-size: 0.88rem; }
.tag { font-size: 0.72rem; padding: 0.1rem 0.5rem; border-radius: 999px; }
.tag.fp { background: #fee2e2; color: #b91c1c; }
.tag.ok { background: #dcfce7; color: #166534; }
button { cursor: pointer; border-radius: 6px; padding: 0.4rem 0.9rem; border: 1px solid transparent; }
button.primary { background: #533afd; color: #fff; }
button.ghost { background: #fff; border-color: #cdd7e3; }
.empty { color: #8a99af; font-size: 0.9rem; }
.error { color: #dc2626; }
@media (max-width: 768px) { .sla-row { grid-template-columns: 1fr; } }
</style>
