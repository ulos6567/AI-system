<script setup lang="ts">
/**
 * 002 (T044) — 장비 상태·예지보전 경고 화면 (FR-017~018, SC-004)
 *   장비 카드(상태·온도·전력·경고) + 선택 시 측정 추이·경고 이력·확인.
 */
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import type { DeviceRow } from '@/api/devices';

const auth = useAuthStore();
const devices = useDevicesStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);
const selected = ref<number | null>(null);

const TYPE_LABEL: Record<string, string> = {
  fridge: '냉장고', showcase: '쇼케이스', freezer: '냉동고', hvac: '공조기',
};
const TYPE_ICON: Record<string, string> = {
  fridge: '🧊', showcase: '🥗', freezer: '❄️', hvac: '🌬️',
};
const STATUS_LABEL: Record<string, string> = {
  normal: '정상', warning: '주의', critical: '위험', offline: '오프라인',
};
const RISK_LABEL: Record<string, string> = { info: '정보', warning: '주의', critical: '위험' };

const selectedHealth = computed(() => (selected.value ? devices.health[selected.value] : null));
const maxTemp = computed(() => {
  const rs = selectedHealth.value?.readings ?? [];
  return Math.max(1, ...rs.map((r) => r.temperature ?? 0));
});
const minTemp = computed(() => {
  const rs = selectedHealth.value?.readings ?? [];
  return Math.min(0, ...rs.map((r) => r.temperature ?? 0));
});

function fmt(ts: string | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function tempY(t: number | null): number {
  if (t === null) return 50;
  const range = maxTemp.value - minTemp.value || 1;
  return 100 - ((t - minTemp.value) / range) * 100;
}

async function load(): Promise<void> {
  await devices.refresh(storeId.value);
}
async function poll(): Promise<void> {
  await devices.poll(storeId.value);
  if (selected.value) await devices.loadHealth(storeId.value, selected.value);
}
async function select(d: DeviceRow): Promise<void> {
  selected.value = d.id;
  await devices.loadHealth(storeId.value, d.id);
}
async function ack(alertId: number): Promise<void> {
  if (selected.value) await devices.ackAlert(storeId.value, selected.value, alertId);
}

onMounted(load);
</script>

<template>
  <div class="devices-view">
    <header class="page-header">
      <div>
        <h2>장비 모니터링 · 예지보전</h2>
        <p class="subtitle">점포 #{{ storeId }} · 온도·전력 추세로 고장을 사전 경고합니다.</p>
      </div>
      <div class="actions">
        <button class="ghost" :disabled="devices.loading" @click="load">새로고침</button>
        <button v-if="auth.isAdmin" class="primary" @click="poll">지금 점검</button>
      </div>
    </header>

    <p v-if="devices.lastError" class="error">{{ devices.lastError }}</p>

    <section class="dev-grid">
      <article
        v-for="d in devices.items"
        :key="d.id"
        class="dev-card"
        :data-status="d.status"
        :class="{ active: selected === d.id }"
        @click="select(d)"
      >
        <div class="dev-head">
          <span class="dev-icon">{{ TYPE_ICON[d.deviceType] }}</span>
          <div>
            <div class="dev-label">{{ d.label }}</div>
            <div class="dev-type">{{ TYPE_LABEL[d.deviceType] }}</div>
          </div>
          <span class="dev-status" :data-status="d.status">{{ STATUS_LABEL[d.status] }}</span>
        </div>
        <div class="dev-metrics">
          <span>🌡 {{ d.latestTemp !== null ? d.latestTemp + '℃' : '-' }}</span>
          <span>⚡ {{ d.latestPower !== null ? d.latestPower + 'W' : '-' }}</span>
          <span v-if="d.openAlerts > 0" class="alert-badge">⚠ 경고 {{ d.openAlerts }}</span>
        </div>
        <div class="dev-time">최근 측정 {{ fmt(d.latestAt) }}</div>
      </article>
    </section>

    <!-- 선택 장비 상세 -->
    <section v-if="selectedHealth" class="card detail">
      <div class="card-header">
        <h3>{{ selectedHealth.device.label }} — 온도 추이 (최근 측정)</h3>
      </div>
      <svg class="trend" viewBox="0 0 300 100" preserveAspectRatio="none">
        <polyline
          :points="selectedHealth.readings.map((r, i) => `${(i / Math.max(1, selectedHealth!.readings.length - 1)) * 300},${tempY(r.temperature)}`).join(' ')"
          fill="none" stroke="#0ea5e9" stroke-width="2"
        />
      </svg>
      <div class="trend-axis"><span>{{ minTemp }}℃</span><span>{{ maxTemp }}℃</span></div>

      <h4 class="alerts-title">예지보전 경고</h4>
      <div v-if="selectedHealth.alerts.length === 0" class="empty">경고가 없습니다.</div>
      <ul v-else class="alert-list">
        <li v-for="a in selectedHealth.alerts" :key="a.id" class="alert-item" :data-risk="a.riskLevel">
          <div class="alert-main">
            <span class="risk-tag" :data-risk="a.riskLevel">{{ RISK_LABEL[a.riskLevel] }}</span>
            <span class="alert-msg">{{ a.recommendedAction }}</span>
          </div>
          <div class="alert-meta">
            발생 {{ fmt(a.raisedAt) }}
            <template v-if="a.predictedFailureAt"> · 예상 임계 {{ fmt(a.predictedFailureAt) }}</template>
            <template v-if="a.acknowledgedAt"> · ✅ 확인됨</template>
            <button v-else-if="auth.isAdmin" class="link" @click="ack(a.id)">확인</button>
          </div>
        </li>
      </ul>
    </section>
    <p v-else class="hint">장비 카드를 선택하면 측정 추이와 경고 이력을 볼 수 있습니다.</p>
  </div>
</template>

<style scoped>
.devices-view { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
.subtitle { color: #6b7280; font-size: 0.9rem; margin: 0.2rem 0 0; }
.actions { display: flex; gap: 0.5rem; }
.dev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
.dev-card { background: #fff; border: 1px solid #e5e7eb; border-left: 4px solid #94a3b8; border-radius: 10px; padding: 0.85rem; cursor: pointer; }
.dev-card[data-status='warning'] { border-left-color: #f59e0b; }
.dev-card[data-status='critical'] { border-left-color: #ef4444; background: #fef2f2; }
.dev-card[data-status='normal'] { border-left-color: #10b981; }
.dev-card.active { box-shadow: 0 0 0 2px #38bdf8; }
.dev-head { display: flex; align-items: center; gap: 0.5rem; }
.dev-icon { font-size: 1.5rem; }
.dev-label { font-weight: 700; font-size: 0.92rem; }
.dev-type { font-size: 0.75rem; color: #6b7280; }
.dev-status { margin-left: auto; font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: #e2e8f0; color: #475569; }
.dev-status[data-status='warning'] { background: #fef3c7; color: #92400e; }
.dev-status[data-status='critical'] { background: #fee2e2; color: #b91c1c; }
.dev-status[data-status='normal'] { background: #dcfce7; color: #166534; }
.dev-metrics { display: flex; gap: 0.75rem; margin-top: 0.6rem; font-size: 0.85rem; color: #334155; flex-wrap: wrap; }
.alert-badge { color: #b45309; font-weight: 700; }
.dev-time { margin-top: 0.4rem; font-size: 0.72rem; color: #94a3b8; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; }
.card-header h3 { margin: 0 0 0.5rem; font-size: 1rem; }
.trend { width: 100%; height: 120px; background: #f8fafc; border-radius: 8px; }
.trend-axis { display: flex; justify-content: space-between; font-size: 0.72rem; color: #94a3b8; margin-top: 0.2rem; }
.alerts-title { margin: 1rem 0 0.5rem; font-size: 0.9rem; }
.alert-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.alert-item { border: 1px solid #e5e7eb; border-left: 3px solid #f59e0b; border-radius: 8px; padding: 0.6rem; }
.alert-item[data-risk='critical'] { border-left-color: #ef4444; background: #fef2f2; }
.alert-main { display: flex; gap: 0.5rem; align-items: center; }
.risk-tag { font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #fef3c7; color: #92400e; }
.risk-tag[data-risk='critical'] { background: #fee2e2; color: #b91c1c; }
.alert-msg { font-size: 0.86rem; }
.alert-meta { margin-top: 0.35rem; font-size: 0.76rem; color: #64748b; }
.link { background: none; border: none; color: #2563eb; text-decoration: underline; cursor: pointer; padding: 0 0 0 0.4rem; }
button { cursor: pointer; border-radius: 6px; padding: 0.4rem 0.9rem; border: 1px solid transparent; }
button.primary { background: #2563eb; color: #fff; }
button.ghost { background: #fff; border-color: #d1d5db; }
.empty, .hint { color: #9ca3af; font-size: 0.9rem; }
.error { color: #dc2626; }
</style>
