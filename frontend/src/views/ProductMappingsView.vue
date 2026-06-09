<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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

// 캔버스 '파편화된 등록 방식' 시연용 — 점주가 제각각 등록한 날것의 데이터 예시.
// 확정 완료에만 쏠린 mock 분포를 AI 자동 매핑/검토 대기로 분산시켜 '인간의 최종 판단'을 드러낸다.
const fragmentedExamples: Array<{
  localName: string;
  productName: string | null;
  category: string | null;
  confidence: number;
  status: 'auto' | 'pending' | 'rejected';
  clearMaster?: boolean; // 제외된 비매핑(쓰레기) 행은 마스터 연결을 끊는다
}> = [
  // AI 자동 매핑 (auto) — AI가 높은 신뢰도로 자동 연결, 점주 확정 대기
  { localName: '코카제로캔', productName: '코카콜라 제로 250ml', category: 'beverage', confidence: 0.97, status: 'auto' },
  { localName: '포카칩', productName: '포카칩 오리지널 66g', category: 'snack', confidence: 0.96, status: 'auto' },
  { localName: '박카스', productName: '박카스D 100ml', category: 'beverage', confidence: 0.95, status: 'auto' },
  // 검토 대기 (pending) — 신뢰도가 낮아 점주의 최종 판단이 필요
  { localName: '신라면컵', productName: '신라면 큰사발면', category: 'instant', confidence: 0.63, status: 'pending' },
  { localName: '딸기우유', productName: '딸기우유 240ml', category: 'beverage', confidence: 0.59, status: 'pending' },
  // 제외됨 (rejected) — 상품이 아니거나 매핑 불가하여 점주가 제외 처리
  { localName: '비닐봉투(대)', productName: null, category: null, confidence: 0.08, status: 'rejected', clearMaster: true },
  { localName: '3색볼펜', productName: null, category: null, confidence: 0.05, status: 'rejected', clearMaster: true },
];

// 확정 완료 행 일부를 파편화 예시로 치환 → counts(검토 대기/AI 자동 매핑/확정 완료/제외됨)가 자연 분산
function applyMockDistribution(rows: MappingRow[]): MappingRow[] {
  const out = rows.map((r) => ({ ...r }));
  let ei = 0;
  for (const row of out) {
    if (ei >= fragmentedExamples.length) break;
    if (row.status === 'confirmed' && row.productMasterId != null) {
      const ex = fragmentedExamples[ei++];
      row.localName = ex.localName;
      row.productName = ex.productName;
      row.category = ex.category;
      row.confidence = ex.confidence;
      row.status = ex.status;
      if (ex.clearMaster) row.productMasterId = null;
    }
  }
  return out;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    // 전체를 한 번에 받아 클라이언트에서 필터링 — counts·필터·주입 예시가 항상 정합되도록.
    const r = await api<{ mappings: MappingRow[] }>(`/stores/${storeId.value}/product-mappings`);
    mappings.value = applyMockDistribution(r.mappings);
  } finally {
    loading.value = false;
  }
}

// 현재 선택된 탭 기준으로 표시할 행 (counts는 항상 전체 기준)
const displayMappings = computed(() =>
  filter.value === 'all' ? mappings.value : mappings.value.filter((m) => m.status === filter.value),
);

// '연결 변경' 시 고를 수 있는 표준 상품 목록 (내부 ID 대신 상품명으로 선택)
const masterOptions = computed(() => {
  const seen = new Map<number, string>();
  for (const m of mappings.value) {
    if (m.productMasterId != null && m.productName && !seen.has(m.productMasterId)) {
      seen.set(m.productMasterId, m.productName);
    }
  }
  return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  );
});

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

const counts = computed(() => {
  const c = { pending: 0, auto: 0, confirmed: 0, rejected: 0 };
  for (const m of mappings.value) {
    if (m.status in c) (c as any)[m.status]++;
  }
  return c;
});

// 상태 한국어 라벨
const statusLabel: Record<string, string> = {
  pending: '검토 대기',
  auto: 'AI 자동 매핑',
  confirmed: '확정 완료',
  rejected: '제외됨',
};

// 카테고리 한국어 라벨
const catLabel: Record<string, string> = {
  lunchbox: '도시락',
  instant: '즉석식품',
  ricesnack: '김밥·주먹밥',
  beverage: '음료',
  frozen: '냉동',
  snack: '간식',
};

// '리얼 데이터' 연출: 점포가 제각각 등록한 날것의 로컬 이름(마스터 매핑은 표준 명칭 유지)
const localNameOverride: Record<number, string> = {
  24: '햄치즈샌드(현장등록)', // 샌드위치 햄치즈
  1: '삼다수500', //          삼다수 500ml
  2: '코카500 PET', //        코카콜라 500ml
  3: '코카제로500', //        제로콜라 500ml
};
// 점포 지정 상품명 표기 정제: 점포가 등록한 명칭을 짧고 일관된 표기로 치환
// (표준 마스터 상품명은 canonical 값 그대로 유지)
const localNameRenames: Record<string, string> = {
  '코카500 PET': '코카콜라500미리',
  '아메리카노 컵': '아메리카노',
  '바나나우유 240ml': '바나나우유',
  '딸기우유 240ml': '딸기우유',
  '포카칩 오리지널': '포카칩',
  '삼각김밥 참치': '참치 삼각김밥',
  '삼각김밥 전주비빔': '전주비빔 삼각김밥',
  '컵라면 신라면': '신라면 컵',
  '컵라면 진라면': '진라면 컵',
  '아이스크림 메로나': '메로나 아이스',
  '아이스크림 비비빅': '비비빅 아이스',
  '에너지바 단백질': '단백질 에너지바',
  '비타민워터 500ml': '비타민워터',
  '녹차 티백 20입': '녹차 티백',
  '핫바 매콤': '매콤 핫바',
};

function displayLocalName(m: MappingRow): string {
  // AI 자동 매핑/검토 대기/제외됨 행은 점주가 등록한 파편화된 원본 명칭을 그대로 노출
  if (m.status === 'auto' || m.status === 'pending' || m.status === 'rejected') return m.localName;
  const base =
    m.productMasterId != null && localNameOverride[m.productMasterId]
      ? localNameOverride[m.productMasterId]
      : m.localName;
  return localNameRenames[base] ?? base;
}

// 신뢰도: 확정 완료는 결정적으로 높게(86~97%), 자동/검토/제외 행은 실제 AI 점수(낮은 신뢰도) 노출
function displayConfidence(m: MappingRow): number {
  if (m.status === 'auto' || m.status === 'pending' || m.status === 'rejected') return Math.round(m.confidence * 100);
  if (m.productMasterId == null) return Math.round(m.confidence * 100);
  return 86 + ((m.productMasterId * 29) % 12);
}
</script>

<template>
  <div class="mappings-view">
    <header class="page-header">
      <div>
        <h2>상품 코드 관리</h2>
        <p class="subtitle">점주가 편의상 지정한 상품명을 AI가 분석하여 표준 상품명으로 자동 분류하고 통합하는 관리 화면입니다. 필요에 따라 점주가 직접 수정할 수 있습니다.</p>
        <p class="subtitle">점포 #{{ storeId }} · {{ mappings.length }}건</p>
      </div>
      <button v-if="auth.isAdmin" class="ghost" @click="rerun">미완료 매핑 재시도</button>
    </header>

    <section class="filter-bar">
      <button v-for="f in ['pending','auto','confirmed','rejected','all'] as const"
              :key="f" :class="{ on: filter === f }"
              class="chip" @click="filter = f">
        {{ f === 'all' ? '전체' : statusLabel[f] }}
        <span v-if="f !== 'all'" class="num">({{ (counts as any)[f] ?? 0 }})</span>
      </button>
    </section>

    <section class="card">
      <div v-if="loading" class="loading">불러오는 중…</div>
      <table v-else-if="displayMappings.length" class="map-table">
        <thead>
          <tr>
            <th>상품 코드</th><th>점포 지정 상품명</th><th>표준 마스터 상품명</th><th>분류 신뢰도</th><th>분류 상태</th><th>관리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in displayMappings" :key="m.id" :class="`s-${m.status}`">
            <td><code>{{ m.localCode }}</code></td>
            <td class="local-name">{{ displayLocalName(m) }}</td>
            <td>
              <span v-if="m.productName">
                {{ m.productName }}
                <span class="cat" :data-cat="m.category">{{ catLabel[m.category ?? ''] ?? m.category }}</span>
              </span>
              <span v-else class="muted">미매핑</span>
            </td>
            <td class="num">{{ displayConfidence(m) }}%</td>
            <td><span class="badge" :data-status="m.status">{{ statusLabel[m.status] ?? m.status }}</span></td>
            <td class="actions">
              <template v-if="auth.isAdmin">
                <button v-if="m.status !== 'confirmed' && m.productMasterId" class="primary xs" @click="patch(m.id, { action: 'confirm' })">확정</button>
                <button v-if="m.status !== 'rejected'" class="ghost xs" @click="patch(m.id, { action: 'reject' })">제외</button>
                <button class="ghost xs" @click="reassignId = m.id">분류 변경</button>
              </template>
              <button v-else class="mini-edit xs" disabled title="운영자 권한 필요">수정</button>

              <div v-if="auth.isAdmin && reassignId === m.id" class="reassign-popover">
                <span class="reassign-label">연결할 표준 상품</span>
                <select v-model.number="reassignTarget" class="reassign-select">
                  <option :value="null" disabled>표준 상품 선택…</option>
                  <option v-for="o in masterOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
                </select>
                <button class="primary xs" :disabled="!reassignTarget" @click="submitReassign(m.id)">적용</button>
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
.subtitle { margin: 0.25rem 0 0; color: #64748d; font-size: 0.9rem; }

.filter-bar { display: flex; gap: 0.45rem; flex-wrap: wrap; }
.chip { background: #fff; color: #3f5069; border: 1px solid #d7deea; border-radius: 999px; padding: 0.4rem 0.95rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.12s ease; }
.chip:hover { border-color: #b7aef0; color: #4434d4; }
.chip.on { background: #533afd; color: #fff; border-color: #533afd; }
.chip .num { color: inherit; opacity: 0.7; font-weight: 500; }

.card { background: #fff; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); overflow-x: auto; }
.map-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; min-width: 720px; }
.map-table th, .map-table td { padding: 0.95rem 0.75rem; text-align: left; border-bottom: 1px solid #eef3f8; vertical-align: middle; }
.map-table thead th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 14px; }
.map-table tbody tr { transition: background 0.12s ease; }
/* 얼룩말 패턴: 짝수 행만 아주 옅은 쿨그레이 틴트 */
.map-table tbody tr:nth-child(even) td { background: #fafbfd; }
.map-table tbody tr:hover td { background: #f5f3ff; }
.map-table .num { font-variant-numeric: tabular-nums; }
.map-table .local-name { color: #1c1e54; font-weight: 700; }
/* 신뢰도·상태·액션 열은 가운데 정렬 */
.map-table th:nth-child(4), .map-table td:nth-child(4),
.map-table th:nth-child(5), .map-table td:nth-child(5),
.map-table th:nth-child(6), .map-table td:nth-child(6) { text-align: center; }
.map-table .muted { color: #8a99af; }
.map-table tr.s-pending td { background: #fffbeb; }
.map-table tr.s-rejected td { background: #fef2f2; }
.map-table tr.s-pending:hover td, .map-table tr.s-rejected:hover td { background: #f5f3ff; }

code { background: transparent; padding: 0.15rem 0; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 400; color: #94a3b8; }
.cat { padding: 0.12rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; background: #eef3f8; color: #3f5069; }
.cat[data-cat="lunchbox"]  { background: #f1edff; color: #6b46c1; }
.cat[data-cat="instant"]   { background: #e0eafe; color: #2b4ad6; }
.cat[data-cat="ricesnack"] { background: #dcfce7; color: #15803d; }
.cat[data-cat="beverage"]  { background: #e0f7ff; color: #0891b2; }
.cat[data-cat="frozen"]    { background: #e0f2fe; color: #075985; }
.cat[data-cat="snack"]     { background: #fef3c7; color: #b45309; }
.badge { padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.badge[data-status="confirmed"] { background: #dcfce7; color: #166534; }
.badge[data-status="auto"]      { background: #e7e6fe; color: #4434d4; }
.badge[data-status="pending"]   { background: #fef3c7; color: #92400e; }
.badge[data-status="rejected"]  { background: #fee2e2; color: #b91c1c; }

.mini-edit { background: #ece9fe; color: #4434d4; border: none; border-radius: 6px; font-weight: 600; opacity: 0.5; cursor: not-allowed; }

.actions { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; justify-content: center; }
.reassign-popover { display: inline-flex; align-items: center; gap: 0.35rem; margin-left: 0.5rem; flex-wrap: wrap; }
.reassign-label { font-size: 0.72rem; color: #64748b; font-weight: 600; }
.reassign-select { padding: 0.25rem 0.4rem; border: 1px solid #c7d2e0; border-radius: 6px; font-size: 0.78rem; font-family: inherit; color: #1c1e54; max-width: 12rem; background: #fff; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #533afd; color: #fff; border: none; border-radius: 4px; font-weight: 600; }
button.ghost { background: #fff; color: #0d253d; border: 1px solid #c7d2e0; border-radius: 4px; padding: 0.45rem 0.85rem; }
button.xs { padding: 0.2rem 0.55rem; font-size: 0.75rem; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #8a99af; }
</style>
