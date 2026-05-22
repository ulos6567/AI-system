<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { selfCheckoutApi, visionApi, type LookupResult } from '@/api/selfCheckout';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const inputCode = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const cart = ref<Array<{ localCode: string; productName: string; unitPrice: number; quantity: number }>>([]);
const lastError = ref<string | null>(null);
const lastResult = ref<{ accepted: number; rejected: number; total: number } | null>(null);
const submitting = ref(false);

const visionStatus = ref(false);
const behavior = ref<Awaited<ReturnType<typeof visionApi.behavior>>['events']>([]);
const zones = ref<Awaited<ReturnType<typeof visionApi.zones>>['zones']>([]);

const total = computed(() => cart.value.reduce((s, it) => s + it.unitPrice * it.quantity, 0));

async function scan(): Promise<void> {
  const q = inputCode.value.trim();
  if (!q) return;
  lastError.value = null;
  try {
    const { results, exactMatch } = await selfCheckoutApi.lookup(storeId.value, q);
    if (!results.length) {
      lastError.value = `상품을 찾을 수 없습니다: "${q}"`;
      return;
    }
    if (exactMatch) {
      addToCart(results[0]);
      inputCode.value = '';
      inputRef.value?.focus();
    } else {
      // 부분 일치 — 1개면 자동 추가, 여러개면 첫 결과 추가
      addToCart(results[0]);
      inputCode.value = '';
    }
  } catch (err: any) {
    lastError.value = err?.message ?? 'lookup_failed';
  }
}

function addToCart(p: LookupResult): void {
  // 추정 단가: master 기반 시드 가격 (간단히 1000~5000 사이 의사 가격 부여)
  const guessedPrice = 1000 + (p.productMasterId * 350);
  const existing = cart.value.find((it) => it.localCode === p.localCode);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.value.push({
      localCode: p.localCode,
      productName: p.productName,
      unitPrice: guessedPrice,
      quantity: 1,
    });
  }
}

function removeFromCart(idx: number): void {
  cart.value.splice(idx, 1);
}

function clearCart(): void {
  cart.value = [];
  lastResult.value = null;
}

async function pay(method: 'mobile' | 'card'): Promise<void> {
  if (cart.value.length === 0) return;
  submitting.value = true;
  lastError.value = null;
  try {
    const r = await selfCheckoutApi.ingest(storeId.value, {
      externalId: `KIOSK-${Date.now()}`,
      occurredAt: new Date().toISOString(),
      posSource: 'self_kiosk',
      totalAmount: total.value,
      paymentMethod: method,
      items: cart.value.map((it) => ({
        localCode: it.localCode,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    });
    lastResult.value = { accepted: r.accepted, rejected: r.rejected, total: total.value };
    if (r.accepted > 0) cart.value = [];
  } catch (err: any) {
    lastError.value = err?.message ?? 'pay_failed';
  } finally {
    submitting.value = false;
  }
}

async function refreshVision(): Promise<void> {
  try {
    const [s, b, z] = await Promise.all([
      visionApi.status(storeId.value),
      visionApi.behavior(storeId.value, 30),
      visionApi.zones(storeId.value),
    ]);
    visionStatus.value = s.capturing;
    behavior.value = b.events;
    zones.value = z.zones;
  } catch { /* ignore */ }
}

async function toggleVision(): Promise<void> {
  if (visionStatus.value) {
    await visionApi.stop(storeId.value);
  } else {
    await visionApi.start(storeId.value);
  }
  await refreshVision();
}

let pollHandle: ReturnType<typeof setInterval> | null = null;
onMounted(async () => {
  await refreshVision();
  pollHandle = setInterval(refreshVision, 7_000);
  inputRef.value?.focus();
});
onBeforeUnmount(() => { if (pollHandle) clearInterval(pollHandle); });

const QUICK = [
  { code: 'S1-001', label: '삼다수' },
  { code: 'S1-002', label: '콜라' },
  { code: 'S1-004', label: '아메리카노' },
  { code: 'S1-011', label: '불고기 도시락' },
  { code: 'S1-014', label: '삼각김밥' },
];

function quickAdd(code: string): void {
  inputCode.value = code;
  scan();
}
</script>

<template>
  <div class="kiosk-view">
    <header class="page-header">
      <div>
        <h2>셀프 결제 (모의)</h2>
        <p class="subtitle">점포 #{{ storeId }} · 바코드 또는 로컬코드 입력</p>
      </div>
      <button class="ghost" :class="{ on: visionStatus }" @click="toggleVision">
        Vision Mock {{ visionStatus ? '⏹ 정지' : '▶ 시작' }}
      </button>
    </header>

    <div class="grid">
      <section class="card scanner">
        <h3>스캔</h3>
        <form @submit.prevent="scan">
          <input
            ref="inputRef"
            v-model="inputCode"
            type="text"
            class="bigInput"
            placeholder="바코드 또는 S1-001 형식"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="primary" type="submit">담기</button>
        </form>
        <p class="hint">자주 쓰는 상품:</p>
        <div class="quick">
          <button v-for="q in QUICK" :key="q.code" class="ghost sm" @click="quickAdd(q.code)">
            {{ q.label }} <span class="muted">({{ q.code }})</span>
          </button>
        </div>
        <p v-if="lastError" class="error">{{ lastError }}</p>
      </section>

      <section class="card cart-card">
        <h3>장바구니 ({{ cart.length }})</h3>
        <table v-if="cart.length" class="cart-table">
          <thead><tr><th>상품</th><th>단가</th><th>수량</th><th>금액</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(it, idx) in cart" :key="it.localCode">
              <td>
                <div>{{ it.productName }}</div>
                <div class="muted small">{{ it.localCode }}</div>
              </td>
              <td class="num">₩{{ it.unitPrice.toLocaleString() }}</td>
              <td>
                <input v-model.number="it.quantity" type="number" min="1" max="99" class="qtyInput" />
              </td>
              <td class="num strong">₩{{ (it.unitPrice * it.quantity).toLocaleString() }}</td>
              <td><button class="ghost xs" @click="removeFromCart(idx)">✕</button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td colspan="3">합계</td><td class="num total">₩{{ total.toLocaleString() }}</td><td></td></tr>
          </tfoot>
        </table>
        <p v-else class="empty">장바구니가 비어 있습니다.</p>

        <div class="pay">
          <button class="ghost" :disabled="!cart.length || submitting" @click="clearCart">초기화</button>
          <button class="primary big" :disabled="!cart.length || submitting" @click="pay('mobile')">📱 모바일 결제</button>
          <button class="primary big" :disabled="!cart.length || submitting" @click="pay('card')">💳 카드 결제</button>
        </div>

        <p v-if="lastResult" class="toast" :class="{ warn: lastResult.rejected > 0 }">
          ✅ 결제 완료 — ₩{{ lastResult.total.toLocaleString() }}
          <span v-if="lastResult.rejected > 0">(거부 {{ lastResult.rejected }}건)</span>
        </p>
      </section>
    </div>

    <section class="card">
      <div class="card-header">
        <h3>Vision 분석 (최근)</h3>
        <button class="ghost sm" @click="refreshVision">새로고침</button>
      </div>

      <div class="analytics-grid">
        <div>
          <h4>존별 활동 (7일)</h4>
          <table v-if="zones.length" class="zones-table">
            <thead><tr><th>존</th><th>이벤트</th><th>체류(초)</th><th>픽업</th><th>세션</th></tr></thead>
            <tbody>
              <tr v-for="z in zones" :key="z.zoneCode">
                <td><span class="zone">{{ z.zoneCode }}</span></td>
                <td class="num">{{ z.events }}</td>
                <td class="num">{{ z.dwellSeconds }}</td>
                <td class="num">{{ z.pickups }}</td>
                <td class="num">{{ z.uniqueSessions }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty">데이터 없음. "Vision Mock 시작" 클릭.</p>
        </div>
        <div>
          <h4>최근 행동 이벤트 (PII 미수집)</h4>
          <ul v-if="behavior.length" class="behavior-list">
            <li v-for="ev in behavior.slice(0, 15)" :key="ev.id">
              <span class="ts">{{ ev.occurredAt.replace('T', ' ').slice(11, 19) }}</span>
              <span class="type">{{ ev.eventType }}</span>
              <span class="zone">{{ ev.zoneCode ?? '—' }}</span>
              <span class="muted small">{{ ev.productName ?? '' }}</span>
              <span v-if="ev.dwellSeconds" class="muted small">{{ ev.dwellSeconds }}초</span>
            </li>
          </ul>
          <p v-else class="empty">이벤트 없음.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.kiosk-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.9rem; }

.grid { display: grid; grid-template-columns: 1fr 1.3fr; gap: 1rem; }
.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card h3 { margin: 0 0 0.75rem; font-size: 1.05rem; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
.card-header h3 { margin: 0; }

.scanner form { display: flex; gap: 0.5rem; }
.bigInput { flex: 1; padding: 0.85rem 0.85rem; font-size: 1.1rem; border: 2px solid #cbd5e1; border-radius: 6px; font-family: ui-monospace, monospace; }
.bigInput:focus { outline: none; border-color: #0ea5e9; }
.hint { font-size: 0.78rem; color: #64748b; margin: 1rem 0 0.4rem; }
.quick { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.quick button { font-size: 0.78rem; }

.cart-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.cart-table th, .cart-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.cart-table th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 0.8rem; }
.cart-table tfoot td { background: #f0f9ff; font-weight: 700; }
.cart-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.cart-table .strong { font-weight: 600; }
.cart-table .total { color: #0369a1; font-size: 1.1rem; }
.qtyInput { width: 60px; padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 4px; text-align: right; }

.pay { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
.pay button { flex: 1; min-width: 140px; }

.analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.zones-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.zones-table th, .zones-table td { padding: 0.4rem 0.4rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.zones-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.zones-table .num { text-align: right; font-variant-numeric: tabular-nums; }

.behavior-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.behavior-list li { padding: 0.35rem 0.5rem; background: #f8fafc; border-radius: 4px; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: baseline; font-size: 0.85rem; }
.behavior-list .ts { font-family: ui-monospace, monospace; color: #94a3b8; font-size: 0.75rem; }
.behavior-list .type { color: #5b21b6; font-weight: 600; font-size: 0.78rem; background: #ede9fe; padding: 0.05rem 0.4rem; border-radius: 3px; }
.zone { background: #dcfce7; color: #166534; padding: 0.05rem 0.4rem; border-radius: 3px; font-size: 0.78rem; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #0ea5e9; color: #fff; border: none; padding: 0.55rem 0.9rem; border-radius: 6px; font-weight: 600; }
button.primary.big { padding: 0.85rem 1rem; font-size: 1rem; }
button.primary:disabled { background: #94a3b8; cursor: not-allowed; }
button.ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.5rem 0.85rem; border-radius: 6px; }
button.ghost.on { background: #dcfce7; color: #166534; border-color: #86efac; }
button.sm { padding: 0.3rem 0.55rem; font-size: 0.8rem; }
button.xs { padding: 0.15rem 0.4rem; font-size: 0.75rem; }

.error { color: #b91c1c; margin: 0.5rem 0 0; font-size: 0.85rem; }
.empty { color: #94a3b8; padding: 1rem; text-align: center; }
.toast { background: #ecfdf5; color: #065f46; padding: 0.7rem 0.9rem; border-radius: 6px; margin-top: 0.75rem; font-weight: 600; font-size: 0.9rem; }
.toast.warn { background: #fef3c7; color: #92400e; }
.muted { color: #94a3b8; }
.small { font-size: 0.78rem; }
h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: #475569; }

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .analytics-grid { grid-template-columns: 1fr; }
}
</style>
