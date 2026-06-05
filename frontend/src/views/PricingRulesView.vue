<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePricingStore } from '@/stores/pricing';
import type { RuleInput, TriggerType, ActionType } from '@/api/pricing';

const auth = useAuthStore();
const pricing = usePricingStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const form = reactive<{
  id: number | null;
  storeId: number | null;
  name: string;
  triggerType: TriggerType;
  triggerCfgText: string;
  actionType: ActionType;
  actionCfgText: string;
  isActive: boolean;
}>({
  id: null,
  storeId: storeId.value,
  name: '',
  triggerType: 'shelf_life',
  triggerCfgText: '{ "threshold_days": 1 }',
  actionType: 'percent_off',
  actionCfgText: '{ "percent": 30, "duration_hours": 4 }',
  isActive: true,
});

const formError = ref<string | null>(null);
const showForm = ref(false);
const evaluatingId = ref<number | null>(null);
const evalResult = ref<{ ruleId: number; applied: number } | null>(null);

onMounted(async () => {
  await pricing.refreshRules(storeId.value);
});

function resetForm(): void {
  form.id = null;
  form.storeId = storeId.value;
  form.name = '';
  form.triggerType = 'shelf_life';
  form.triggerCfgText = '{ "threshold_days": 1 }';
  form.actionType = 'percent_off';
  form.actionCfgText = '{ "percent": 30, "duration_hours": 4 }';
  form.isActive = true;
  formError.value = null;
}

function editRule(id: number): void {
  const r = pricing.rules.find((x) => x.id === id);
  if (!r) return;
  form.id = r.id;
  form.storeId = r.storeId;
  form.name = r.name;
  form.triggerType = r.triggerType;
  form.triggerCfgText = JSON.stringify(r.triggerConfig ?? {}, null, 2);
  form.actionType = r.actionType;
  form.actionCfgText = JSON.stringify(r.actionConfig ?? {}, null, 2);
  form.isActive = !!r.isActive;
  showForm.value = true;
}

function startNew(): void {
  resetForm();
  showForm.value = true;
}

async function save(): Promise<void> {
  formError.value = null;
  let triggerCfg: Record<string, unknown> = {};
  let actionCfg: Record<string, unknown> = {};
  try {
    triggerCfg = form.triggerCfgText.trim() ? JSON.parse(form.triggerCfgText) : {};
    actionCfg = form.actionCfgText.trim() ? JSON.parse(form.actionCfgText) : {};
  } catch (err: any) {
    formError.value = `JSON 파싱 실패: ${err.message}`;
    return;
  }
  const input: RuleInput = {
    storeId: form.storeId,
    name: form.name,
    triggerType: form.triggerType,
    triggerConfig: triggerCfg,
    actionType: form.actionType,
    actionConfig: actionCfg,
    isActive: form.isActive,
  };
  try {
    if (form.id) {
      await pricing.updateRule(form.id, input);
    } else {
      await pricing.createRule(input);
    }
    showForm.value = false;
    resetForm();
  } catch (err: any) {
    formError.value = err?.message ?? 'failed';
  }
}

async function remove(id: number): Promise<void> {
  if (!confirm(`룰 #${id} 삭제?`)) return;
  await pricing.deleteRule(id);
}

async function evaluateNow(id: number): Promise<void> {
  evaluatingId.value = id;
  try {
    const applied = await pricing.evaluate(id, storeId.value);
    evalResult.value = { ruleId: id, applied };
    setTimeout(() => { evalResult.value = null; }, 5000);
  } finally {
    evaluatingId.value = null;
  }
}

function presetFor(t: TriggerType): string {
  switch (t) {
    case 'shelf_life': return '{ "threshold_days": 1 }';
    case 'weather':    return '{ "min_rain_mm": 1, "product_master_ids": [4, 5, 6, 7] }';
    case 'demand_drop':return '{ "window_days": 7, "min_drop_pct": 30, "product_master_ids": [1, 2, 3] }';
    case 'schedule':   return '{ "days_of_week": ["sat","sun"], "start_hour": 17, "end_hour": 21, "product_master_ids": [11, 12, 13] }';
    case 'manual':     return '{}';
  }
}
function presetActionFor(a: ActionType): string {
  switch (a) {
    case 'percent_off': return '{ "percent": 30, "duration_hours": 4 }';
    case 'fixed_price': return '{ "price": 1500, "duration_hours": 4 }';
    case 'bundle':      return '{ "percent": 15, "duration_hours": 4 }';
  }
}

function triggerLabel(t: TriggerType): string {
  switch (t) {
    case 'shelf_life':  return '유통기한 임박';
    case 'weather':     return '날씨';
    case 'demand_drop': return '수요 하락';
    case 'schedule':    return '스케줄';
    case 'manual':      return '수동';
  }
}
function actionLabel(a: ActionType): string {
  return a === 'percent_off' ? '% 할인' : a === 'fixed_price' ? '고정가' : '번들';
}
</script>

<template>
  <div class="pricing-rules-view">
    <header class="page-header">
      <div>
        <h2>실시간 가격 관리</h2>
        <p class="subtitle">{{ pricing.rules.length }}건 · 점포 #{{ storeId }}</p>
      </div>
      <button v-if="auth.isAdmin" class="primary" @click="startNew">+ 새 룰</button>
    </header>

    <section v-if="evalResult" class="toast">
      ✅ 룰 #{{ evalResult.ruleId }} 평가 완료 — {{ evalResult.applied }}건 적용
    </section>

    <section v-if="showForm" class="card form-card">
      <div class="card-header">
        <h3>{{ form.id ? `룰 #${form.id} 수정` : '새 룰 만들기' }}</h3>
        <button class="ghost sm" @click="showForm = false">닫기</button>
      </div>
      <div class="form-grid">
        <label>이름
          <input v-model="form.name" type="text" placeholder="예: 도시락 마감 할인" />
        </label>
        <label>점포 (NULL=전사)
          <input v-model.number="form.storeId" type="number" placeholder="비우면 전사 룰" />
        </label>
        <label>활성
          <input v-model="form.isActive" type="checkbox" />
        </label>
        <label>트리거
          <select v-model="form.triggerType" @change="form.triggerCfgText = presetFor(form.triggerType)">
            <option value="shelf_life">유통기한 임박</option>
            <option value="weather">날씨</option>
            <option value="demand_drop">수요 하락</option>
            <option value="schedule">스케줄</option>
            <option value="manual">수동</option>
          </select>
        </label>
        <label>액션
          <select v-model="form.actionType" @change="form.actionCfgText = presetActionFor(form.actionType)">
            <option value="percent_off">% 할인</option>
            <option value="fixed_price">고정가</option>
            <option value="bundle">번들</option>
          </select>
        </label>
        <label class="full">트리거 설정 (JSON)
          <textarea v-model="form.triggerCfgText" rows="4" spellcheck="false"></textarea>
        </label>
        <label class="full">액션 설정 (JSON)
          <textarea v-model="form.actionCfgText" rows="3" spellcheck="false"></textarea>
        </label>
      </div>
      <p v-if="formError" class="error">{{ formError }}</p>
      <div class="form-actions">
        <button class="ghost" @click="showForm = false">취소</button>
        <button class="primary" @click="save">저장</button>
      </div>
    </section>

    <section class="card">
      <table v-if="pricing.rules.length" class="rules-table">
        <thead>
          <tr><th>ID</th><th>이름</th><th>트리거</th><th>액션</th><th>점포</th><th>활성</th><th>액션</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in pricing.rules" :key="r.id">
            <td class="num">#{{ r.id }}</td>
            <td>{{ r.name }}</td>
            <td><span class="badge">{{ triggerLabel(r.triggerType) }}</span></td>
            <td><span class="badge">{{ actionLabel(r.actionType) }}</span></td>
            <td class="muted">{{ r.storeId ?? '전사' }}</td>
            <td>{{ r.isActive ? '✅' : '⏸️' }}</td>
            <td class="row-actions">
              <template v-if="auth.isAdmin">
                <button class="primary sm" :disabled="evaluatingId === r.id" @click="evaluateNow(r.id)">
                  {{ evaluatingId === r.id ? '평가 중…' : '평가' }}
                </button>
                <button class="ghost sm" @click="editRule(r.id)">수정</button>
                <button class="ghost sm danger" @click="remove(r.id)">삭제</button>
              </template>
              <span v-else class="readonly-hint">열람 전용</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">등록된 룰이 없습니다. 새 룰을 추가하세요.</div>
    </section>
  </div>
</template>

<style scoped>
.pricing-rules-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748b; font-size: 0.9rem; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
h3 { margin: 0; font-size: 1.05rem; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
.form-grid label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #475569; }
.form-grid .full { grid-column: 1 / -1; }
.form-grid input[type="text"], .form-grid input[type="number"], .form-grid select, .form-grid textarea {
  padding: 0.45rem 0.55rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.9rem;
  font-family: inherit;
}
.form-grid textarea { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 0.82rem; }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }

.rules-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.rules-table th, .rules-table td { padding: 0.55rem 0.5rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.rules-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.rules-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.rules-table .muted { color: #94a3b8; }
.readonly-hint { font-size: 0.72rem; color: #a4a097; font-style: italic; }
.row-actions { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.badge { background: #ede9fe; color: #5b21b6; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.78rem; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #0ea5e9; color: #fff; border: none; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; }
button.primary:disabled { background: #94a3b8; cursor: not-allowed; }
button.ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.45rem 0.85rem; border-radius: 6px; }
button.ghost.danger { color: #b91c1c; border-color: #fecaca; }
button.sm { padding: 0.3rem 0.6rem; font-size: 0.8rem; }

.error { color: #b91c1c; font-size: 0.85rem; margin: 0.5rem 0 0; }
.empty { padding: 1.5rem; text-align: center; color: #94a3b8; }

.toast { background: #ecfdf5; color: #065f46; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.9rem; }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .rules-table { font-size: 0.82rem; }
}
</style>
