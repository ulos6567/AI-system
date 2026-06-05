<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useInsightsStore } from '@/stores/insights';
import type { PrescriptiveAction } from '@/api/insights';

const auth = useAuthStore();
const insights = useInsightsStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const generating = ref(false);

const actionLabel: Record<string, string> = {
  price_markdown: '가격 인하',
  promotion: '프로모션',
  reorder: '재발주',
  reallocate: '재배치',
  staffing: '인력 조정',
};
const statusLabel: Record<string, string> = {
  proposed: '제안됨',
  approved: '승인됨',
  executed: '실행됨',
  rejected: '거절됨',
  expired: '만료됨',
};

const proposed = computed(() => insights.actions.filter((a) => a.status === 'proposed'));
const history = computed(() => insights.actions.filter((a) => a.status !== 'proposed'));

function expectedText(a: PrescriptiveAction): string {
  const e = a.expectedEffect as any;
  if (!e) return '';
  const metric = e.metric === 'revenue' ? '매출' : '판매량';
  return `예상 ${metric} +${e.expectedUpliftPct ?? 0}%`;
}

async function load(): Promise<void> {
  await insights.refresh(storeId.value);
}

async function runGenerate(): Promise<void> {
  generating.value = true;
  try {
    await insights.generate(storeId.value);
  } finally {
    generating.value = false;
  }
}

async function approve(a: PrescriptiveAction): Promise<void> {
  await insights.approve(storeId.value, a.id);
  await insights.loadOutcome(storeId.value, a.id);
}

async function reject(a: PrescriptiveAction): Promise<void> {
  const reason = window.prompt('거절 사유를 입력하세요', '현장 상황과 맞지 않음');
  if (!reason) return;
  await insights.reject(storeId.value, a.id, reason);
}

async function showOutcome(a: PrescriptiveAction): Promise<void> {
  await insights.loadOutcome(storeId.value, a.id);
}

onMounted(load);
</script>

<template>
  <div class="insights-view">
    <header class="page-header">
      <div>
        <h2>처방형 인사이트</h2>
        <p class="subtitle">점포 #{{ storeId }} · 신호 → 처방 → 승인 실행 → 효과 검증</p>
      </div>
      <div class="actions">
        <button class="ghost" :disabled="insights.loading" @click="load">새로고침</button>
        <button v-if="auth.isAdmin" class="primary" :disabled="generating" @click="runGenerate">
          {{ generating ? '분석 중…' : '지금 분석' }}
        </button>
      </div>
    </header>

    <p v-if="insights.lastError" class="error">{{ insights.lastError }}</p>

    <!-- 제안된 처방 카드 -->
    <section class="card">
      <div class="card-header"><h3>오늘의 처방 ({{ proposed.length }})</h3></div>
      <div v-if="insights.loading" class="loading">불러오는 중…</div>
      <div v-else-if="proposed.length === 0" class="empty">현재 제안된 처방이 없습니다. ‘지금 분석’으로 신호를 탐지하세요.</div>
      <ul v-else class="action-list">
        <li v-for="a in proposed" :key="a.id" class="action-card" :data-sev="a.priority >= 400 ? 'high' : 'mid'">
          <div class="action-head">
            <span class="badge type">{{ actionLabel[a.actionType] ?? a.actionType }}</span>
            <span class="conf">신뢰도 {{ (a.confidence * 100).toFixed(0) }}%</span>
          </div>
          <p class="rationale">{{ a.rationale }}</p>
          <p class="expected">{{ expectedText(a) }}<span v-if="a.targetProductName"> · 대상: {{ a.targetProductName }}</span></p>
          <div v-if="auth.isAdmin" class="action-btns">
            <button class="primary" @click="approve(a)">실행</button>
            <button class="ghost" @click="reject(a)">거절</button>
          </div>
          <p v-else class="muted">실행/거절은 운영자 권한이 필요합니다.</p>
        </li>
      </ul>
    </section>

    <!-- 처방 이력 + 검증 -->
    <section class="card">
      <div class="card-header"><h3>처방 이력</h3></div>
      <div v-if="history.length === 0" class="empty">이력이 없습니다.</div>
      <table v-else class="hist-table">
        <thead>
          <tr><th>처방</th><th>대상</th><th>상태</th><th>효과 검증</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in history" :key="a.id">
            <td>{{ actionLabel[a.actionType] ?? a.actionType }}</td>
            <td>{{ a.targetProductName ?? '점포 전체' }}</td>
            <td><span class="status" :data-s="a.status">{{ statusLabel[a.status] ?? a.status }}</span></td>
            <td>
              <template v-if="a.status === 'executed'">
                <span v-if="insights.outcomes[a.id]?.verifiedAt">
                  적중: {{ insights.outcomes[a.id]?.hit ? '✅' : '❌' }}
                  (정확도 {{ ((insights.outcomes[a.id]?.accuracy ?? 0) * 100).toFixed(0) }}%)
                </span>
                <button v-else class="link" @click="showOutcome(a)">검증 조회</button>
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
.insights-view { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.subtitle { color: #6b7280; font-size: 0.9rem; }
.actions { display: flex; gap: 0.5rem; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; }
.card-header { display: flex; justify-content: space-between; margin-bottom: 0.75rem; }
.action-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
.action-card { border: 1px solid #e5e7eb; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 0.85rem; }
.action-card[data-sev='high'] { border-left-color: #ef4444; }
.action-head { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.4rem; }
.badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px; }
.badge.type { background: #eff6ff; color: #1d4ed8; }
.badge.sig { background: #fef3c7; color: #92400e; }
.conf { margin-left: auto; font-size: 0.8rem; color: #6b7280; }
.rationale { margin: 0.25rem 0; }
.expected { color: #059669; font-size: 0.85rem; font-weight: 600; }
.action-btns { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
button { cursor: pointer; border-radius: 6px; padding: 0.4rem 0.9rem; border: 1px solid transparent; }
button.primary { background: #2563eb; color: #fff; }
button.ghost { background: #fff; border-color: #d1d5db; }
button.link { background: none; color: #2563eb; text-decoration: underline; padding: 0; }
.hist-table { width: 100%; border-collapse: collapse; }
.hist-table th, .hist-table td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #f3f4f6; }
.status[data-s='executed'] { color: #059669; }
.status[data-s='rejected'] { color: #dc2626; }
.empty, .loading, .muted { color: #9ca3af; font-size: 0.9rem; }
.error { color: #dc2626; }
</style>
