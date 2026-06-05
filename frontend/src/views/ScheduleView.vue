<script setup lang="ts">
/**
 * 002 (T048) — 근무 일정 화면 (FR-022~024, SC-011)
 *   주차 선택 → 초안 생성 → 시프트 그리드·예상 인건비·제약 위반 표시 → 확정.
 */
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import type { ScheduleShift } from '@/api/schedules';

const auth = useAuthStore();
const schedules = useSchedulesStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const SHIFT_ROWS = [
  { code: 'open', label: '오픈 07:00–15:00', start: '07:00' },
  { code: 'mid', label: '미들 11:00–19:00', start: '11:00' },
  { code: 'close', label: '마감 14:00–22:00', start: '14:00' },
];

/** 다가오는 월요일을 기본 주차로 제안. */
function nextMonday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7; // 다음 월요일까지
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
const weekStart = ref(nextMonday());

const detail = computed(() => schedules.current);

const weekDates = computed<string[]>(() => {
  if (!detail.value) return [];
  const start = new Date(detail.value.weekStart + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
});

/** (날짜, 시프트시작) → 배정된 시프트 목록. */
function shiftsAt(date: string, start: string): ScheduleShift[] {
  if (!detail.value) return [];
  return detail.value.shifts.filter((s) => s.shiftDate === date && s.startTime === start);
}

function dowLabel(date: string): string {
  return DOW[new Date(date + 'T00:00:00').getDay()];
}
function dayNum(date: string): string {
  return String(new Date(date + 'T00:00:00').getDate());
}
function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

async function generate(): Promise<void> {
  await schedules.generate(storeId.value, weekStart.value);
}
async function confirm(): Promise<void> {
  if (detail.value?.id) await schedules.confirm(storeId.value, detail.value.id);
}
async function openSummary(id: number): Promise<void> {
  await schedules.open(storeId.value, id);
}

onMounted(() => schedules.refresh(storeId.value));
</script>

<template>
  <div class="schedule-view">
    <header class="page-header">
      <div>
        <h2>근무 일정</h2>
        <p class="subtitle">점포 #{{ storeId }} · 수요 예측 기반 시프트 초안과 예상 인건비를 제안합니다.</p>
      </div>
      <div class="actions" v-if="auth.isAdmin">
        <input type="date" v-model="weekStart" class="week-input" />
        <button class="primary" :disabled="schedules.loading" @click="generate">초안 생성</button>
      </div>
    </header>

    <p v-if="!auth.isAdmin" class="hint">스케줄 생성·확정은 관리자(본사) 계정만 가능합니다. 아래에서 기존 스케줄을 열람할 수 있어요.</p>
    <p v-if="schedules.lastError" class="error">{{ schedules.lastError }}</p>

    <!-- 최근 스케줄 목록 -->
    <section v-if="schedules.items.length" class="card list">
      <h3>최근 스케줄</h3>
      <table>
        <thead>
          <tr><th>주 시작</th><th>상태</th><th>시프트</th><th>예상 인건비</th><th>위반</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in schedules.items" :key="s.id">
            <td>{{ s.weekStart }}</td>
            <td><span class="status" :data-status="s.status">{{ s.status === 'confirmed' ? '확정' : '초안' }}</span></td>
            <td>{{ s.shiftCount }}</td>
            <td>{{ won(s.estimatedLaborCost) }}</td>
            <td><span :class="{ warn: s.violationCount > 0 }">{{ s.violationCount }}</span></td>
            <td><button class="link" @click="openSummary(s.id)">열기</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 선택/생성된 스케줄 상세 -->
    <section v-if="detail" class="card detail">
      <div class="detail-head">
        <h3>{{ detail.weekStart }} 주간 스케줄
          <span class="status" :data-status="detail.status">{{ detail.status === 'confirmed' ? '확정' : '초안' }}</span>
        </h3>
        <div class="summary">
          <span class="cost">예상 인건비 <strong>{{ won(detail.estimatedLaborCost) }}</strong></span>
          <button
            v-if="auth.isAdmin && detail.status === 'draft'"
            class="primary"
            @click="confirm"
          >확정</button>
        </div>
      </div>

      <!-- 제약 위반 -->
      <div v-if="detail.constraintViolations.length" class="violations">
        <strong>⚠ 제약 위반 / 인원 부족 ({{ detail.constraintViolations.length }})</strong>
        <ul>
          <li v-for="(v, i) in detail.constraintViolations" :key="i">{{ v }}</li>
        </ul>
      </div>
      <p v-else class="ok-note">✅ 모든 시프트가 법정·가용성 제약을 충족합니다.</p>

      <!-- 시프트 그리드 -->
      <div class="grid-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th class="corner">시프트</th>
              <th v-for="d in weekDates" :key="d" :class="{ weekend: [0,6].includes(new Date(d + 'T00:00:00').getDay()) }">
                {{ dowLabel(d) }}<br /><small>{{ dayNum(d) }}일</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in SHIFT_ROWS" :key="row.code">
              <th class="rowhead">{{ row.label }}</th>
              <td v-for="d in weekDates" :key="d + row.code">
                <div v-for="sh in shiftsAt(d, row.start)" :key="sh.employeeId" class="chip">
                  {{ sh.employeeName }}
                </div>
                <span v-if="!shiftsAt(d, row.start).length" class="gap">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-else-if="!schedules.items.length" class="hint">아직 생성된 스케줄이 없습니다. 주차를 선택하고 초안을 생성하세요.</p>
  </div>
</template>

<style scoped>
.schedule-view { display: flex; flex-direction: column; gap: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
.subtitle { color: #64748d; font-size: 0.9rem; margin: 0.2rem 0 0; }
.actions { display: flex; gap: 0.5rem; align-items: center; }
.week-input { padding: 0.35rem 0.5rem; border: 1px solid #cdd7e3; border-radius: 6px; }
.card { background: #fff; border: 1px solid #e3e8ee; border-radius: 10px; padding: 1rem; }
.card h3 { margin: 0 0 0.75rem; font-size: 1rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.list th, .list td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #eef3f8; }
.status { font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: #e3e8ee; color: #3f5069; }
.status[data-status='confirmed'] { background: #dcfce7; color: #166534; }
.status[data-status='draft'] { background: #fef3c7; color: #92400e; }
.warn { color: #b91c1c; font-weight: 700; }
.detail-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.summary { display: flex; align-items: center; gap: 0.75rem; }
.cost { font-size: 0.9rem; color: #273951; }
.cost strong { color: #0d253d; }
.violations { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 0.6rem 0.75rem; margin: 0.75rem 0; color: #b91c1c; font-size: 0.84rem; }
.violations ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
.ok-note { color: #166534; font-size: 0.86rem; margin: 0.75rem 0; }
.grid-wrap { overflow-x: auto; }
.grid th, .grid td { border: 1px solid #e3e8ee; padding: 0.4rem; text-align: center; vertical-align: top; min-width: 84px; }
.grid thead th { background: #f6f9fc; font-size: 0.78rem; }
.grid .weekend { color: #dc2626; }
.grid .rowhead { background: #f6f9fc; text-align: left; font-size: 0.78rem; white-space: nowrap; }
.grid .corner { background: #eef3f8; }
.chip { background: #ecebfe; color: #2e2b8c; border-radius: 6px; padding: 0.15rem 0.4rem; margin: 0.1rem 0; font-size: 0.78rem; }
.gap { color: #c7d2e0; }
button { cursor: pointer; border-radius: 6px; padding: 0.4rem 0.9rem; border: 1px solid transparent; }
button.primary { background: #533afd; color: #fff; }
button.link { background: none; border: none; color: #533afd; text-decoration: underline; cursor: pointer; padding: 0; }
.hint { color: #8a99af; font-size: 0.9rem; }
.error { color: #dc2626; }
</style>
