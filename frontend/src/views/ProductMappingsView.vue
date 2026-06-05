<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';

interface MappingRow {
  id: number;
  localCode: string;
  localName: string;
  productMasterId: number | null;
  productName: string | null;
  category: string | null;
  barcode: string | null;
  confidence: number;
  status: 'auto' | 'confirmed' | 'rejected' | 'pending';
  updatedAt: string;
}

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

// 기본값을 'all'로: 검토 대기(pending)가 없을 때도 확정(confirmed) 매핑 현황이 바로 보이도록 한다.
const filter = ref<'all' | 'pending' | 'auto' | 'confirmed' | 'rejected'>('all');
const mappings = ref<MappingRow[]>([]);
const loading = ref(false);
const reassignId = ref<number | null>(null);
const reassignTarget = ref<number | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const qs = filter.value === 'all' ? '' : `?status=${filter.value}`;
    const r = await api<{ mappings: MappingRow[] }>(`/stores/${storeId.value}/product-mappings${qs}`);
    mappings.value = r.mappings;
  } finally {
    loading.value = false;
  }
}

async function patch(id: number, body: any): Promise<void> {
  await api(`/stores/${storeId.value}/product-mappings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  await load();
}

async function rerun(): Promise<void> {
  const r = await api<{ attempted: number; resolved: number }>(
    `/stores/${storeId.value}/product-mappings/auto-rerun`,
    { method: 'POST', body: '{}' },
  );
  alert(`재매핑 시도 ${r.attempted}건 → 해소 ${r.resolved}건`);
  await load();
}

async function submitReassign(id: number): Promise<void> {
  if (!reassignTarget.value) return;
  await patch(id, { action: 'reassign', productMasterId: reassignTarget.value });
  reassignId.value = null;
  reassignTarget.value = null;
}

onMounted(load);
watch(filter, load);

const counts = computed(() => {
  const c = { pending: 0, auto: 0, confirmed: 0, rejected: 0 };
  for (const m of mappings.value) {
    if (m.status in c) (c as any)[m.status]++;
  }
  return c;
});
</script>

<template>
  <div class="mappings-view">
    <header class="page-header">
      <div>
        <h2>상품 코드 표준화 관리</h2>
        <p class="subtitle">각 점포별로 상이한 상품 코드를 AI 기반 마스터 데이터 체계로 정제하고 표준화하는 메뉴입니다.</p>
        <p class="subtitle">점포 #{{ storeId }} · {{ mappings.length }}건</p>
      </div>
      <button v-if="auth.isAdmin" class="ghost" @click="rerun">미해소 재매핑 시도</button>
    </header>

    <section class="filter-bar">
      <button v-for="f in ['pending','auto','confirmed','rejected','all'] as const"
              :key="f" :class="{ on: filter === f }"
              class="chip" @click="filter = f">
        {{ f === 'all' ? '전체' : f }}
        <span v-if="f !== 'all'" class="num">({{ (counts as any)[f] ?? 0 }})</span>
      </button>
    </section>

    <section class="card">
      <div v-if="loading" class="loading">불러오는 중…</div>
      <table v-else-if="mappings.length" class="map-table">
        <thead>
          <tr>
            <th>로컬 코드</th><th>로컬 이름</th><th>마스터 매핑</th><th>신뢰도</th><th>상태</th><th>액션</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in mappings" :key="m.id" :class="`s-${m.status}`">
            <td><code>{{ m.localCode }}</code></td>
            <td>{{ m.localName }}</td>
            <td>
              <span v-if="m.productName">{{ m.productName }} <span class="cat">({{ m.category }})</span></span>
              <span v-else class="muted">미매핑</span>
            </td>
            <td class="num">{{ (m.confidence * 100).toFixed(0) }}%</td>
            <td><span class="badge" :data-status="m.status">{{ m.status }}</span></td>
            <td class="actions">
              <template v-if="auth.isAdmin">
                <button v-if="m.status !== 'confirmed' && m.productMasterId" class="primary xs" @click="patch(m.id, { action: 'confirm' })">확정</button>
                <button v-if="m.status !== 'rejected'" class="ghost xs" @click="patch(m.id, { action: 'reject' })">제외</button>
                <button class="ghost xs" @click="reassignId = m.id">연결 변경</button>
              </template>
              <span v-else class="readonly-hint">열람 전용</span>

              <div v-if="auth.isAdmin && reassignId === m.id" class="reassign-popover">
                <input v-model.number="reassignTarget" type="number" placeholder="master id" />
                <button class="primary xs" @click="submitReassign(m.id)">적용</button>
                <button class="ghost xs" @click="reassignId = null">취소</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">조회 결과 없음</div>
    </section>
  </div>
</template>

<style scoped>
.mappings-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.9rem; }

.filter-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.chip { background: #fff; color: #475569; border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.3rem 0.75rem; font-size: 0.85rem; cursor: pointer; }
.chip.on { background: #0ea5e9; color: #fff; border-color: #0ea5e9; }
.chip .num { color: inherit; opacity: 0.7; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); overflow-x: auto; }
.map-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 720px; }
.map-table th, .map-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.map-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.map-table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* 신뢰도 열(4번째)은 헤더·값 모두 좌측 정렬 */
.map-table th:nth-child(4),
.map-table td:nth-child(4) { text-align: left; }
.map-table .muted { color: #94a3b8; }
.readonly-hint { font-size: 0.72rem; color: #a4a097; font-style: italic; }
.map-table tr.s-pending td { background: #fffbeb; }
.map-table tr.s-rejected td { background: #fef2f2; }

code { background: #f1f5f9; padding: 0.1rem 0.4rem; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 0.85rem; }
.cat { background: #f1f5f9; padding: 0.05rem 0.4rem; border-radius: 3px; font-size: 0.72rem; color: #475569; }
.badge { padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; }
.badge[data-status="confirmed"] { background: #dcfce7; color: #166534; }
.badge[data-status="auto"]      { background: #dbeafe; color: #1d4ed8; }
.badge[data-status="pending"]   { background: #fef3c7; color: #92400e; }
.badge[data-status="rejected"]  { background: #fee2e2; color: #b91c1c; }

.actions { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; }
.reassign-popover { display: flex; gap: 0.25rem; margin-left: 0.5rem; }
.reassign-popover input { width: 80px; padding: 0.2rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 4px; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #0ea5e9; color: #fff; border: none; border-radius: 4px; font-weight: 600; }
button.ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0.45rem 0.85rem; }
button.xs { padding: 0.2rem 0.55rem; font-size: 0.75rem; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #94a3b8; }
</style>
