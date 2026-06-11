<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { cashApi, type CashOverview, type Shift } from '@/api/cash';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);
const canWrite = computed(() => auth.isAdmin);

const data = ref<CashOverview | null>(null);
const loading = ref(false);
const lastError = ref<string | null>(null);
const submitting = ref(false);
const actionMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);

const SHIFT_LABEL: Record<Shift, string> = { open: '오픈(개점)', mid: '중간', close: '마감(폐점)' };
const DENOMS = [50000, 10000, 5000, 1000, 500, 100] as const;

// 입력 폼 상태
const shift = ref<Shift>('close');
const memo = ref('');
const useDenoms = ref(true);
const denoms = reactive<Record<number, number>>({ 50000: 0, 10000: 0, 5000: 0, 1000: 0, 500: 0, 100: 0 });
const manualAmount = ref(0);

const denomTotal = computed(() => DENOMS.reduce((s, d) => s + d * (denoms[d] || 0), 0));
const countedAmount = computed(() => (useDenoms.value ? denomTotal.value : manualAmount.value));
const expected = computed(() => data.value?.status.expectedAmount ?? 0);
const diffPreview = computed(() => countedAmount.value - expected.value);

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signed = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')}원`;
function fmt(dt: string): string {
  return dt.slice(0, 16).replace('T', ' ');
}

async function load(): Promise<void> {
  loading.value = true;
  lastError.value = null;
  try {
    data.value = await cashApi.overview(storeId.value);
  } catch (err: any) {
    lastError.value = err?.message ?? 'failed';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function resetForm(): void {
  for (const d of DENOMS) denoms[d] = 0;
  manualAmount.value = 0;
  memo.value = '';
}

async function submit(): Promise<void> {
  if (!canWrite.value || submitting.value) return;
  if (countedAmount.value <= 0) {
    actionMsg.value = { kind: 'err', text: '실측 시재 금액을 입력하세요.' };
    return;
  }
  submitting.value = true;
  actionMsg.value = null;
  try {
    const payload: any = { shift: shift.value, countedAmount: countedAmount.value, memo: memo.value || undefined };
    if (useDenoms.value) {
      const filled: Record<string, number> = {};
      for (const d of DENOMS) if (denoms[d] > 0) filled[String(d)] = denoms[d];
      if (Object.keys(filled).length) payload.denominations = filled;
    }
    const res = await cashApi.create(storeId.value, payload);
    const diff = res.count.difference;
    actionMsg.value = {
      kind: diff === 0 ? 'ok' : Math.abs(diff) < 1000 ? 'ok' : 'err',
      text:
        diff === 0
          ? '시재 점검 완료 — 예상과 정확히 일치합니다. ✓'
          : `시재 점검 완료 — 과부족 ${signed(diff)} (${diff > 0 ? '과잉' : '부족'})`,
    };
    resetForm();
    await load();
  } catch (err: any) {
    actionMsg.value = { kind: 'err', text: `등록 실패: ${err?.message ?? 'error'}` };
  } finally {
    submitting.value = false;
  }
}

function diffClass(n: number): string {
  if (n === 0) return 'ok';
  return n > 0 ? 'over' : 'short';
}
</script>

<template>
  <div class="cash-view">
    <header class="page-header">
      <div>
        <h2>시재 점검</h2>
        <p class="subtitle">점포 #{{ storeId }} · 금전등록기 현금 시재를 실측해 예상 시재와 대조합니다.</p>
      </div>
      <button class="refresh" :disabled="loading" @click="load">↻ 새로고침</button>
    </header>

    <div v-if="actionMsg" class="toast" :class="actionMsg.kind">{{ actionMsg.text }}</div>
    <div v-if="!canWrite" class="readonly-note">👁 열람 전용 계정입니다. 시재 점검 등록은 관리자만 가능합니다.</div>

    <div v-if="loading" class="loading">불러오는 중…</div>
    <div v-else-if="lastError" class="error">에러: {{ lastError }}</div>

    <template v-else-if="data">
      <!-- 예상 시재 현황 -->
      <section class="status-grid">
        <div class="stat big">
          <span class="label">예상 시재 (지금 서랍에 있어야 할 현금)</span>
          <span class="value">{{ won(data.status.expectedAmount) }}</span>
          <span class="sub">{{ data.status.sinceLabel }} 기준</span>
        </div>
        <div class="stat">
          <span class="label">기준액 (직전 점검 실측)</span>
          <span class="value sm">{{ won(data.status.openingFloat) }}</span>
          <span class="sub">{{ data.status.lastCountedAt ? fmt(data.status.lastCountedAt) : '점검 이력 없음 · 기본 준비금' }}</span>
        </div>
        <div class="stat">
          <span class="label">+ 현금 매출</span>
          <span class="value sm plus">{{ won(data.status.cashSales) }}</span>
          <span class="sub">현금 거래 {{ data.status.cashTxCount.toLocaleString('ko-KR') }}건</span>
        </div>
      </section>

      <!-- 시재 점검 입력 -->
      <section class="card">
        <div class="card-header"><h3>📝 시재 점검 등록</h3></div>
        <div class="form">
          <div class="form-row">
            <label class="fld">
              교대 구분
              <select v-model="shift" :disabled="!canWrite">
                <option value="open">오픈(개점)</option>
                <option value="mid">중간</option>
                <option value="close">마감(폐점)</option>
              </select>
            </label>
            <label class="fld check">
              <input v-model="useDenoms" type="checkbox" :disabled="!canWrite" />
              권종별 매수로 계산
            </label>
          </div>

          <div v-if="useDenoms" class="denom-grid">
            <div v-for="d in DENOMS" :key="d" class="denom">
              <span class="denom-label">{{ d.toLocaleString('ko-KR') }}원</span>
              <input v-model.number="denoms[d]" type="number" min="0" :disabled="!canWrite" />
              <span class="denom-sub">{{ won(d * (denoms[d] || 0)) }}</span>
            </div>
          </div>
          <div v-else class="manual">
            <label class="fld">
              실측 시재 합계
              <input v-model.number="manualAmount" type="number" min="0" :disabled="!canWrite" placeholder="직접 입력" />
            </label>
          </div>

          <label class="fld">
            메모 (선택)
            <input v-model="memo" type="text" maxlength="255" :disabled="!canWrite" placeholder="예: 5만원권 1장 거스름돈 부족 추정" />
          </label>

          <!-- 미리보기 -->
          <div class="preview">
            <div><span class="p-label">실측</span><span class="p-val">{{ won(countedAmount) }}</span></div>
            <div><span class="p-label">예상</span><span class="p-val">{{ won(expected) }}</span></div>
            <div class="p-diff" :class="diffClass(diffPreview)">
              <span class="p-label">과부족</span><span class="p-val">{{ signed(diffPreview) }}</span>
            </div>
            <button class="btn primary" :disabled="!canWrite || submitting" @click="submit">
              {{ submitting ? '등록 중…' : '시재 점검 등록' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 점검 이력 -->
      <section class="card">
        <div class="card-header"><h3>🧾 시재 점검 이력</h3></div>
        <table v-if="data.counts.length" class="hist-table">
          <thead>
            <tr>
              <th>일시</th><th>교대</th><th>기준액</th><th>현금매출</th><th>예상</th><th>실측</th><th>과부족</th><th>담당</th><th>메모</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in data.counts" :key="c.id">
              <td class="muted">{{ fmt(c.countedAt) }}</td>
              <td><span class="shift-chip">{{ SHIFT_LABEL[c.shift] }}</span></td>
              <td class="num">{{ won(c.openingFloat) }}</td>
              <td class="num">{{ won(c.cashSales) }}</td>
              <td class="num">{{ won(c.expectedAmount) }}</td>
              <td class="num">{{ won(c.countedAmount) }}</td>
              <td class="num"><span class="diff" :class="diffClass(c.difference)">{{ signed(c.difference) }}</span></td>
              <td class="muted">{{ c.userName ?? '—' }}</td>
              <td class="muted memo">{{ c.memo ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">아직 시재 점검 기록이 없습니다.</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.cash-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.3rem 0 0; color: #64748d; font-size: 0.9rem; }
.refresh { border: 1px solid #c7d2e0; background: #fff; border-radius: 6px; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem; }
.refresh:hover { background: #eef3f8; }

.toast { padding: 0.7rem 1rem; border-radius: 8px; font-size: 0.9rem; }
.toast.ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.toast.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.readonly-note { background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; padding: 0.55rem 0.9rem; border-radius: 8px; font-size: 0.85rem; }

.status-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 0.75rem; }
.stat { background: #fff; border-radius: 10px; padding: 1.1rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); display: flex; flex-direction: column; gap: 0.3rem; }
.stat.big { background: linear-gradient(120deg, #533afd, #6f63ff); color: #fff; }
.stat .label { font-size: 0.8rem; opacity: 0.85; }
.stat.big .label { color: #e7e6ff; }
.stat .value { font-size: 1.7rem; font-weight: 800; color: #0d253d; }
.stat.big .value { color: #fff; }
.stat .value.sm { font-size: 1.3rem; }
.stat .value.plus { color: #047857; }
.stat .sub { font-size: 0.74rem; color: #94a3b8; }
.stat.big .sub { color: #d7d4ff; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.9rem; }
h3 { margin: 0; font-size: 1.05rem; }

.form { display: flex; flex-direction: column; gap: 0.9rem; }
.form-row { display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; }
.fld { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #3f5069; }
.fld.check { flex-direction: row; align-items: center; gap: 0.4rem; }
.fld select, .fld input { padding: 0.45rem 0.6rem; border: 1px solid #c7d2e0; border-radius: 6px; font-size: 0.9rem; }

.denom-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.6rem; }
.denom { display: flex; flex-direction: column; gap: 0.25rem; border: 1px solid #eef3f8; border-radius: 8px; padding: 0.6rem; }
.denom-label { font-size: 0.82rem; font-weight: 600; color: #334155; }
.denom input { padding: 0.35rem 0.5rem; border: 1px solid #c7d2e0; border-radius: 5px; text-align: right; }
.denom-sub { font-size: 0.74rem; color: #94a3b8; text-align: right; }
.manual .fld input { max-width: 240px; text-align: right; }

.preview { display: flex; align-items: center; gap: 1.2rem; flex-wrap: wrap; border-top: 1px dashed #e7edf4; padding-top: 0.9rem; }
.preview > div { display: flex; flex-direction: column; }
.p-label { font-size: 0.74rem; color: #94a3b8; }
.p-val { font-size: 1.05rem; font-weight: 700; color: #0d253d; font-variant-numeric: tabular-nums; }
.p-diff.over .p-val { color: #1d4ed8; }
.p-diff.short .p-val { color: #b91c1c; }
.p-diff.ok .p-val { color: #047857; }
.preview .btn { margin-left: auto; }

.btn { border: none; border-radius: 6px; padding: 0.55rem 1.1rem; font-size: 0.9rem; cursor: pointer; font-weight: 600; }
.btn.primary { background: #533afd; color: #fff; }
.btn.primary:hover { background: #4434d4; }
.btn.primary:disabled { background: #c7c2f5; cursor: not-allowed; }

.hist-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.hist-table th, .hist-table td { padding: 0.5rem 0.5rem; text-align: left; border-bottom: 1px solid #eef3f8; }
.hist-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.hist-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.hist-table .muted { color: #8a99af; }
.hist-table .memo { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shift-chip { font-size: 0.74rem; background: #eef3f8; color: #3f5069; padding: 0.1rem 0.45rem; border-radius: 4px; white-space: nowrap; }
.diff { font-weight: 700; }
.diff.over { color: #1d4ed8; }
.diff.short { color: #b91c1c; }
.diff.ok { color: #047857; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #8a99af; }
.error { padding: 1rem; color: #b91c1c; }

@media (max-width: 768px) {
  .status-grid { grid-template-columns: 1fr; }
  .hist-table { font-size: 0.78rem; }
  .hist-table th:nth-child(3), .hist-table td:nth-child(3),
  .hist-table th:nth-child(9), .hist-table td:nth-child(9) { display: none; }
}
</style>
