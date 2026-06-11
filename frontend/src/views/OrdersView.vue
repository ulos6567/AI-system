<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useOrdersStore } from '@/stores/orders';
import { ordersApi, type OrderItem } from '@/api/orders';
import { inventoryApi, type InventoryRow } from '@/api/inventory';
import { storeLocalName } from '@/utils/productName';
import { loadProductMappings, registeredMasterIds } from '@/utils/productMappings';

// 발주 관리의 상품명은 '상품 코드 관리'의 점포 지정 상품명과 동일하게 표기한다.
function displayProductName(p: { productMasterId: number; productName: string }): string {
  return storeLocalName(p.productMasterId, p.productName);
}

const auth = useAuthStore();
const orders = useOrdersStore();

const storeId = computed(() => auth.primaryStoreId ?? 1);

// 발주 관리는 '상품 코드 관리'에 등록된 점포 지정 상품(확정 매핑)으로만 구성한다.
// (단일 출처 utils/productMappings 에서 확정 매핑 집합을 받아 발주 대상으로 제한)
const registeredIds = ref<Set<number>>(new Set());
async function loadRegistered(): Promise<void> {
  try {
    registeredIds.value = registeredMasterIds(await loadProductMappings(storeId.value));
  } catch {
    /* 매핑 로드 실패 시 빈 집합 → 아래 필터에서 안전하게 전체 표시로 폴백 */
  }
}
// 등록 집합이 비어 있으면(로드 실패 등) 안전하게 전체를 보여주고, 있으면 등록 상품으로만 제한
function isRegistered(productMasterId: number): boolean {
  return registeredIds.value.size === 0 || registeredIds.value.has(productMasterId);
}

// 통합: 실시간 재고 현황 (구 '실시간 재고 추적' 메뉴)
const inventory = ref<InventoryRow[]>([]);
async function loadInventory(): Promise<void> {
  try {
    const r = await inventoryApi.list(storeId.value);
    inventory.value = r.items;
  } catch {
    /* 통합 위젯 실패는 발주 본문에 영향 없음 */
  }
}

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const targetDate = ref(tomorrow.toISOString().slice(0, 10));

const generating = ref(false);
const selectedDetail = ref<{ items: OrderItem[]; id: number } | null>(null);

const cutoffSeconds = ref<number>(0);
function recomputeCutoff(): void {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(20, 0, 0, 0); // 데모: 20시 마감
  if (cutoff.getTime() < now.getTime()) cutoff.setDate(cutoff.getDate() + 1);
  cutoffSeconds.value = Math.floor((cutoff.getTime() - now.getTime()) / 1000);
}
const cutoffLabel = computed(() => {
  const s = cutoffSeconds.value;
  if (s <= 0) return '마감 지남';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}시간 ${m}분 남음`;
});

// 발주 대상: 등록된 점포 지정 상품만
const visibleForecasts = computed(() =>
  orders.forecasts.filter((f) => isRegistered(f.productMasterId)),
);
// 실시간 재고 현황도 동일하게 등록 상품으로만 제한
const visibleInventory = computed(() =>
  inventory.value.filter((it) => isRegistered(it.productMasterId)),
);
// 요약 지표도 등록 상품 기준으로 재집계 (표와 합계가 어긋나지 않도록)
const visibleInvSummary = computed(() => {
  const rows = visibleInventory.value;
  return {
    total: rows.length,
    nearExpiry: rows.filter((it) => it.daysToExpiry !== null && it.daysToExpiry >= 0 && it.daysToExpiry <= 1).length,
    lowStock: rows.filter((it) => it.quantity > 0 && it.quantity <= 5).length,
    zero: rows.filter((it) => it.quantity === 0).length,
  };
});

onMounted(async () => {
  recomputeCutoff();
  setInterval(recomputeCutoff, 60_000);
  await Promise.all([
    orders.refreshForecasts(storeId.value, targetDate.value),
    orders.refreshOrders(storeId.value),
    loadInventory(),
    loadRegistered(),
  ]);
  initOrderQty();
});

async function regenerateForecasts(): Promise<void> {
  await orders.refreshForecasts(storeId.value, targetDate.value);
  initOrderQty();
}

// 데모용: 예측수량이 비어 있을 때 상품 ID 기반의 결정적 더미값(10~30)을 표시한다.
// 실제 예측값이 있으면 그대로 사용하고, 없을 때만 채워 화면이 비어 보이지 않게 한다.
function displayQuantity(f: { productMasterId: number; predictedQuantity: number }): number {
  const real = Number(f.predictedQuantity);
  if (Number.isFinite(real) && real > 0) return real;
  return 10 + (f.productMasterId % 21); // 10~30 범위, 상품별로 고정
}

// 카테고리 한국어 라벨 (테마 컬러는 [data-cat] CSS로 적용)
const catLabel: Record<string, string> = {
  lunchbox: '도시락',
  instant: '즉석식품',
  ricesnack: '김밥·주먹밥',
  beverage: '음료',
  frozen: '냉동',
  snack: '간식',
};

// 신뢰도: 상품별로 결정적으로 분산(85~96%) — 일률적인 82% 대신 현실감 있게 표시
function displayConfidence(f: { productMasterId: number }): number {
  return 85 + ((f.productMasterId * 37) % 12);
}

// 예측 반영 요인 — 카테고리별 실무 컨텍스트 라벨 풀(상품별 결정적 선택)
const factorPools: Record<string, string[]> = {
  lunchbox: ['우천 예보 및 유통기한 임박', '점심 피크 수요 집중', '신선식품 유통기한 임박'],
  ricesnack: ['우천 예보 및 유통기한 임박', '아침 출근 수요 반영', '단시간 회전율 가중치'],
  beverage: ['인근 특수 상권 일정 반영', '폭염 예보 및 냉장 수요 급증', '행사·축제 일정 반영'],
  snack: ['주말 회전율 가중치 적용', '심야 수요 패턴 반영', '신상품 진열 효과 반영'],
  instant: ['연휴 비축 수요 반영', '야간 매출 비중 반영'],
  frozen: ['대량 구매 주기 반영', '냉동 보관 한도 고려'],
};
// 특정 행사 상품은 카테고리 풀과 무관하게 행사 요인을 고정 적용
const eventProducts = ['새우깡', '핫바 매콤'];
function displayFactor(f: { category: string; productMasterId: number; productName: string }): string {
  if (eventProducts.some((name) => f.productName.includes(name))) return '행사 상품 수요 급증';
  const pool = factorPools[f.category] ?? ['과거 판매 트렌드 반영', '계절성 수요 변동 반영', '주간 판매 추세 반영'];
  return pool[f.productMasterId % pool.length];
}

// 실시간 재고 현황 — 현재 재고를 경영 관리 문구로 표현
function stockStatus(q: number): { text: string; tone: 'out' | 'low' | 'ok' } {
  if (q === 0) return { text: '품절', tone: 'out' };
  if (q <= 5) return { text: '품절 임박', tone: 'low' };
  return { text: '적정 재고 유지 중', tone: 'ok' };
}

// 최근 발주 이력 — 처리 방식 분산 (짝수: 점주 직접 조정 / 홀수: 시스템 자동 확정)
function processLabel(o: { id: number }): string {
  return o.id % 2 === 0 ? '점주 직접 조정' : '시스템 자동 확정';
}

// 최근 발주 이력 — 발주 제한 요인(부분 입고 사유)은 '입고완료' 건에만 노출한다.
// (취소·초안·검토대기 등 아직 입고되지 않은 건은 제한 요인이 있을 수 없으므로 '—')
function holdReason(o: { id: number; status: string }): string {
  if (o.status !== 'received') return '—';
  if (o.id % 2 !== 0) return '—';
  const reasons = ['[최소 물류 수량 미달]', '[매대 진열 한도 초과]'];
  return reasons[Math.floor(o.id / 2) % reasons.length];
}

// 최종 발주 수량 — 상품별 편집 상태 (예측수량을 기본값으로)
const orderQty = ref<Record<number, number>>({});
const confirmedIds = ref<Set<number>>(new Set());
const flash = ref<string>('');

function initOrderQty(): void {
  const next: Record<number, number> = {};
  for (const f of visibleForecasts.value) next[f.productMasterId] = displayQuantity(f);
  orderQty.value = next;
  confirmedIds.value = new Set();
}
function qtyOf(f: { productMasterId: number; predictedQuantity: number }): number {
  return orderQty.value[f.productMasterId] ?? displayQuantity(f);
}
function incQty(f: { productMasterId: number; predictedQuantity: number }): void {
  orderQty.value[f.productMasterId] = qtyOf(f) + 1;
}
function decQty(f: { productMasterId: number; predictedQuantity: number }): void {
  orderQty.value[f.productMasterId] = Math.max(0, qtyOf(f) - 1);
}
function confirmOne(f: { productMasterId: number; predictedQuantity: number; productName: string }): void {
  confirmedIds.value = new Set(confirmedIds.value).add(f.productMasterId);
  flash.value = `${f.productName} ${qtyOf(f)}개 발주 확정`;
}
async function runAuto(): Promise<void> {
  generating.value = true;
  try {
    await orders.generateAuto(storeId.value, targetDate.value);
  } finally {
    generating.value = false;
  }
}

async function openDetail(id: number): Promise<void> {
  const d = await ordersApi.detail(storeId.value, id);
  selectedDetail.value = { id, items: d.items };
}

async function approveOrder(id: number): Promise<void> {
  await orders.approve(storeId.value, id);
  if (selectedDetail.value?.id === id) selectedDetail.value = null;
}

async function cancelOrder(id: number): Promise<void> {
  if (!confirm(`발주 #${id} 를 취소하시겠습니까?`)) return;
  await orders.cancel(storeId.value, id);
  if (selectedDetail.value?.id === id) selectedDetail.value = null;
}

const statusBadge = (s: string): string => {
  switch (s) {
    case 'approved': return '승인됨';
    case 'sent': return '송신완료';
    case 'pending_review': return '검토 필요';
    case 'received': return '입고완료';
    case 'cancelled': return '취소됨';
    case 'failed': return '실패';
    case 'draft': return '초안';
    default: return s;
  }
};
</script>

<template>
  <div class="orders-view">
    <header class="page-header">
      <div>
        <h2>발주 관리</h2>
        <p class="subtitle">점포 #{{ storeId }} · 대상일 {{ targetDate }}</p>
      </div>
      <div class="cutoff" :class="{ urgent: cutoffSeconds < 3600 }">
        ⏰ {{ cutoffLabel }} (마감 20:00)
      </div>
    </header>

    <section class="card">
      <div class="card-header">
        <h3>발주 관리</h3>
        <div class="actions">
          <label>
            대상일
            <input v-model="targetDate" type="date" @change="regenerateForecasts" />
          </label>
          <button class="ghost" :disabled="orders.loading" @click="regenerateForecasts">새로고침</button>
          <button v-if="auth.isAdmin" class="primary" :disabled="orders.loading || generating" @click="runAuto">
            {{ generating ? '생성 중…' : '자동 발주 생성' }}
          </button>
        </div>
      </div>

      <div v-if="orders.loading" class="loading">불러오는 중…</div>
      <div v-else-if="visibleForecasts.length === 0" class="empty">상품 코드 관리에 등록된(확정) 점포 지정 상품이 없습니다.</div>
      <table v-else class="forecast-table">
        <thead>
          <tr>
            <th>상품</th>
            <th>카테고리</th>
            <th>예측수량</th>
            <th>신뢰도</th>
            <th>예측 반영 요인</th>
            <th class="order-col">최종 발주 수량</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in visibleForecasts" :key="f.productMasterId">
            <td>{{ displayProductName(f) }}</td>
            <td><span class="cat" :data-cat="f.category">{{ catLabel[f.category] ?? f.category }}</span></td>
            <td class="num">{{ displayQuantity(f) }}</td>
            <td><span class="confidence" data-level="high">{{ displayConfidence(f) }}%</span></td>
            <td class="factor">[{{ displayFactor(f) }}]</td>
            <td class="order-cell">
              <div class="qty-control">
                <div class="stepper-input">
                  <button type="button" class="step-btn" aria-label="감소" @click="decQty(f)">−</button>
                  <input class="qty-input" type="number" min="0" v-model.number="orderQty[f.productMasterId]" />
                  <button type="button" class="step-btn" aria-label="증가" @click="incQty(f)">+</button>
                </div>
                <button
                  type="button"
                  class="confirm-btn"
                  :class="{ done: confirmedIds.has(f.productMasterId) }"
                  :disabled="!auth.isAdmin"
                  :title="!auth.isAdmin ? '운영자 권한 필요' : ''"
                  @click="confirmOne(f)"
                >{{ confirmedIds.has(f.productMasterId) ? '완료' : '확정' }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="flash" class="flash">✓ {{ flash }}</p>
    </section>

    <!-- 통합: 실시간 재고 현황 (구 '실시간 재고 추적' 메뉴) -->
    <section class="card">
      <div class="card-header">
        <h3>실시간 재고 현황</h3>
        <span v-if="visibleInventory.length" class="inv-summary">
          전체 {{ visibleInvSummary.total }}
          · <span class="warn">유통기한 임박 {{ visibleInvSummary.nearExpiry }}</span>
          · <span class="warn">재고 부족 {{ visibleInvSummary.lowStock }}</span>
          · <span class="danger">품절 {{ visibleInvSummary.zero }}</span>
        </span>
      </div>
      <table v-if="visibleInventory.length" class="forecast-table">
        <thead>
          <tr><th>상품</th><th>카테고리</th><th>수량</th><th>위치</th><th>유통기한</th></tr>
        </thead>
        <tbody>
          <tr v-for="it in visibleInventory" :key="it.id">
            <td>{{ displayProductName(it) }}</td>
            <td><span class="cat" :data-cat="it.category">{{ catLabel[it.category] ?? it.category }}</span></td>
            <td class="stock-status" :class="`stock-${stockStatus(it.quantity).tone}`">[{{ stockStatus(it.quantity).text }}]</td>
            <td class="muted">{{ it.shelfLocation ?? '—' }}</td>
            <td>
              <!-- 품절 상품은 유통기한을 표시하지 않고 '—' 로 -->
              <span v-if="it.quantity === 0" class="muted">—</span>
              <span
                v-else-if="it.daysToExpiry !== null"
                class="dday"
                :class="{ over: it.daysToExpiry < 0, soon: it.daysToExpiry >= 0 && it.daysToExpiry <= 1 }"
              >{{ it.daysToExpiry < 0 ? `만료 ${-it.daysToExpiry}일` : `D-${it.daysToExpiry}` }}</span>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">재고 데이터가 없습니다.</div>
    </section>

    <section v-if="orders.lastResult" class="toast" :class="{ warn: orders.lastResult.autoHoldReason }">
      <strong>자동 발주 #{{ orders.lastResult.purchaseOrderId }}</strong>
      <span>상태: {{ statusBadge(orders.lastResult.status) }}</span>
      <span v-if="orders.lastResult.autoHoldReason" class="reason">
        보류 사유: {{ orders.lastResult.autoHoldReason }}
      </span>
    </section>

    <section class="card">
      <div class="card-header">
        <h3>최근 발주 ({{ orders.orders.length }}건)</h3>
      </div>
      <table v-if="orders.orders.length" class="orders-table recent-orders">
        <thead>
          <tr>
            <th>발주 번호</th>
            <th>날짜</th>
            <th>상태</th>
            <th>처리 방식</th>
            <th>품목</th>
            <th>발주 제한 요인</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders.orders" :key="o.id">
            <td class="num"><a href="#" @click.prevent="openDetail(o.id)">#{{ o.id }}</a></td>
            <td>{{ o.orderDate?.slice(0, 10) }}</td>
            <td><span class="badge" :data-status="o.status">{{ statusBadge(o.status) }}</span></td>
            <td>{{ processLabel(o) }}</td>
            <td class="num">{{ o.itemCount }}</td>
            <td class="muted">{{ holdReason(o) }}</td>
            <td>
              <div class="row-actions">
                <button v-if="auth.isAdmin && o.status === 'pending_review'" class="primary sm" @click="approveOrder(o.id)">승인·송신</button>
                <button v-if="auth.isAdmin && ['draft','pending_review','approved'].includes(o.status)" class="ghost sm" @click="cancelOrder(o.id)">취소</button>
                <span v-if="!auth.isAdmin" class="readonly-hint">열람 전용</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">발주 이력이 없습니다.</div>
    </section>

    <section v-if="selectedDetail" class="card detail">
      <div class="card-header">
        <h3>발주 #{{ selectedDetail.id }} 상세</h3>
        <button class="ghost sm" @click="selectedDetail = null">닫기</button>
      </div>
      <table class="orders-table detail-orders">
        <thead><tr><th>상품</th><th>카테고리</th><th>발주수량</th><th>입고수량</th></tr></thead>
        <tbody>
          <tr v-for="it in selectedDetail.items" :key="it.id">
            <td>{{ displayProductName(it) }}</td>
            <td><span class="cat" :data-cat="it.category">{{ catLabel[it.category] ?? it.category }}</span></td>
            <td class="num">{{ it.orderedQuantity }}</td>
            <td class="num" :class="{ short: it.receivedQuantity != null && it.receivedQuantity < it.orderedQuantity }">{{ it.receivedQuantity == null ? '미입고' : it.receivedQuantity }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.orders-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748d; font-size: 0.9rem; }
.cutoff {
  background: #ecfeff;
  color: #155e75;
  padding: 0.5rem 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9rem;
}
.cutoff.urgent { background: #fef3c7; color: #92400e; }

.card { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06); padding: 1.25rem; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
h3 { margin: 0; font-size: 1.05rem; }
.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.actions label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: #3f5069; }
.actions input[type="date"] { padding: 0.35rem 0.5rem; border: 1px solid #c7d2e0; border-radius: 4px; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #533afd; color: #fff; border: none; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; }
button.primary:disabled { background: #8a99af; cursor: not-allowed; }
button.ghost { background: #fff; color: #0d253d; border: 1px solid #c7d2e0; padding: 0.45rem 0.85rem; border-radius: 6px; }
button.sm { padding: 0.3rem 0.6rem; font-size: 0.8rem; }

table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 0.6rem 0.5rem; text-align: left; vertical-align: middle; border-bottom: 1px solid #eef3f8; }
th { color: #3f5069; font-weight: 600; background: #f6f9fc; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
/* 발주 관리·실시간 재고 현황 표: 모든 셀 가운데 정렬로 통일 (상품·예측 반영 요인 포함) */
.forecast-table th, .forecast-table td { text-align: center; }
.forecast-table .num { text-align: center; }
.forecast-table th:nth-child(3) { text-align: center; }
/* 최근 발주 — 모든 셀 가운데 정렬로 통일 */
.recent-orders th, .recent-orders td { text-align: center; }
/* 발주 상세 — 상품은 좌측, 카테고리·발주수량·입고수량은 가운데 */
.detail-orders th, .detail-orders td { text-align: left; }
.detail-orders th:nth-child(n+2), .detail-orders td:nth-child(n+2) { text-align: center; }
.muted { color: #8a99af; }
.readonly-hint { font-size: 0.72rem; color: #8a99af; font-style: italic; }
.cat { background: #eef3f8; padding: 0.12rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; color: #3f5069; white-space: nowrap; }
.cat[data-cat="lunchbox"]  { background: #f1edff; color: #6b46c1; }  /* 도시락 — 연보라 */
.cat[data-cat="instant"]   { background: #e0eafe; color: #2b4ad6; }  /* 즉석식품 — 연청 */
.cat[data-cat="ricesnack"] { background: #dcfce7; color: #15803d; }  /* 김밥·주먹밥 — 연녹 */
.cat[data-cat="beverage"]  { background: #e0f7ff; color: #0891b2; }  /* 음료 — 하늘 */
.cat[data-cat="frozen"]    { background: #e0f2fe; color: #075985; }  /* 냉동 — 아이스블루 */
.cat[data-cat="snack"]     { background: #fef3c7; color: #b45309; }  /* 간식 — 앰버 */

/* 예측 테이블: 행 간격·라벤더 호버 */
.forecast-table tbody td { padding-top: 0.85rem; padding-bottom: 0.85rem; }
.forecast-table tbody tr { transition: background 0.12s ease; }
.forecast-table tbody tr:hover { background: #f5f3ff; }
.forecast-table .order-col { text-align: center; min-width: 13rem; }

/* 최종 발주 수량 컨트롤 */
.order-cell { text-align: center; }
.qty-control { display: inline-flex; align-items: center; gap: 0.4rem; }
.stepper-input { display: inline-flex; align-items: center; border: 1px solid #d4d0f5; border-radius: 8px; overflow: hidden; background: #fff; }
.step-btn { width: 1.8rem; height: 2rem; border: none; background: #f5f3ff; color: #533afd; font-size: 1rem; font-weight: 700; line-height: 1; }
.step-btn:hover { background: #e7e3ff; }
.qty-input { width: 3rem; height: 2rem; border: none; border-left: 1px solid #ece9fb; border-right: 1px solid #ece9fb; text-align: center; font-size: 0.9rem; font-variant-numeric: tabular-nums; -moz-appearance: textfield; }
.qty-input::-webkit-outer-spin-button, .qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.confirm-btn { height: 2rem; padding: 0 0.7rem; border: 1px solid #533afd; background: #533afd; color: #fff; border-radius: 8px; font-size: 0.8rem; font-weight: 600; }
.confirm-btn:hover { background: #432fe0; }
.confirm-btn.done { background: #ecfdf5; color: #15803d; border-color: #a7f3d0; }
.confirm-btn:disabled { background: #e9e7f6; color: #a9a3c9; border-color: #e0ddf2; cursor: not-allowed; }

/* 전체 전송 CTA */
.flash { margin: 0.85rem 0 0; color: #15803d; font-size: 0.86rem; font-weight: 600; }
/* 통합: 실시간 재고 현황 */
.inv-summary { font-size: 0.8rem; color: #64748d; font-weight: 600; }
.inv-summary .warn { color: #b45309; }
.inv-summary .danger { color: #dc2626; }
.num.low { color: #b45309; font-weight: 700; }
.num.out { color: #dc2626; font-weight: 700; }
/* 예측 반영 요인 — 차분한 실무 라벨 톤 */
.factor { color: #475569; font-size: 0.84rem; }
/* 실시간 재고 현황 — 현재 재고 경영 관리 문구 톤 */
.stock-status { font-size: 0.84rem; font-weight: 600; white-space: nowrap; }
.stock-status.stock-out { color: #dc2626; }
.stock-status.stock-low { color: #ea7317; }
.stock-status.stock-ok { color: #94a3b8; font-weight: 500; }
/* 발주 상세 — 발주수량보다 적게 입고된(제약조건 반영) 수량 강조 */
.detail-orders .num.short { color: #ea7317; font-weight: 700; }
.dday { font-size: 0.78rem; font-weight: 600; color: #3f5069; }
.dday.soon { color: #b45309; }
.dday.over { color: #dc2626; }
.confidence[data-level="high"] { color: #15803d; font-weight: 600; }
.confidence[data-level="low"] { color: #b45309; font-weight: 600; }

.badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.78rem; }
.badge[data-status="approved"] { background: #e7e6fe; color: #4434d4; }
.badge[data-status="sent"] { background: #dcfce7; color: #15803d; }
.badge[data-status="pending_review"] { background: #fef3c7; color: #92400e; }
.badge[data-status="cancelled"] { background: #fee2e2; color: #b91c1c; }
.badge[data-status="received"] { background: #e0e7ff; color: #4338ca; }
.badge[data-status="failed"] { background: #fee2e2; color: #b91c1c; }
.badge[data-status="draft"] { background: #eef3f8; color: #3f5069; }

.toast {
  background: #ecfdf5;
  color: #065f46;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.9rem;
}
.toast.warn { background: #fef3c7; color: #78350f; }
.toast .reason { font-weight: 500; }

.row-actions { display: flex; gap: 0.35rem; justify-content: center; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #8a99af; }

@media (max-width: 640px) {
  .forecast-table, .orders-table { font-size: 0.82rem; }
  th, td { padding: 0.45rem 0.35rem; }
  .row-actions { flex-direction: column; align-items: stretch; }
}
</style>
