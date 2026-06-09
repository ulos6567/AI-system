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
// '할인율 및 혜택' — actionConfig 값을 사람이 읽는 문구로
// actionConfig.percent 가 비어 있으면 세일 명칭에 적힌 퍼센트(예: '30% 타임세일')로 보정
function benefitLabel(r: { actionType: ActionType; actionConfig: Record<string, unknown> | null; name: string }): string {
  const c = (r.actionConfig ?? {}) as Record<string, any>;
  const percentFromName = (): number => {
    const m = r.name.match(/(\d+)\s*%/);
    return m ? Number(m[1]) : 0;
  };
  if (r.actionType === 'percent_off') {
    const pct = Number(c.percent) || percentFromName();
    return `${pct}% 할인${c.duration_hours ? ` · ${c.duration_hours}시간` : ''}`;
  }
  if (r.actionType === 'fixed_price') {
    return `${Number(c.price ?? 0).toLocaleString()}원 고정가`;
  }
  return `번들 ${Number(c.percent) || percentFromName()}% 할인`;
}

// 상단 현황 위젯
const activeCount = computed(() => pricing.rules.filter((r) => !!r.isActive).length);
const todayConverted = 14; // 데모: 오늘 타임세일로 전환된 상품 수
const cumulativeGain = 42500; // 데모: 타임세일 누적 추가 매출(원)
</script>

<template>
  <div class="pricing-rules-view">
    <header class="page-header">
      <div>
        <h2>실시간 가격 설정</h2>
        <p class="subtitle">{{ pricing.rules.length }}건의 가격 규칙 · 점포 #{{ storeId }}</p>
      </div>
      <button
        class="primary add-rule"
        :disabled="!auth.isAdmin"
        :title="!auth.isAdmin ? '운영자 권한 필요' : ''"
        @click="startNew"
      >+ 세일 항목 추가</button>
    </header>

    <!-- 상단 현황 위젯 -->
    <section class="summary-cards">
      <div class="metric-card">
        <div class="metric-text">
          <span class="metric-label">진행 중인 세일</span>
          <strong class="metric-value">{{ activeCount }}건</strong>
        </div>
        <span class="metric-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        </span>
      </div>
      <div class="metric-card">
        <div class="metric-text">
          <span class="metric-label">오늘 타임세일 전환</span>
          <strong class="metric-value">{{ todayConverted }}개 상품</strong>
        </div>
        <span class="metric-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </span>
      </div>
      <div class="metric-card">
        <div class="metric-text">
          <span class="metric-label">타임세일 누적 성과</span>
          <strong class="metric-value gain">+{{ cumulativeGain.toLocaleString() }}원</strong>
        </div>
        <span class="metric-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="15 7 21 7 21 13" />
          </svg>
        </span>
      </div>
    </section>

    <section v-if="evalResult" class="toast">
      ✅ 룰 #{{ evalResult.ruleId }} 평가 완료 — {{ evalResult.applied }}건 적용
    </section>

    <section v-if="showForm" class="card form-card">
      <div class="card-header">
        <h3>{{ form.id ? `룰 #${form.id} 수정` : '새 룰 만들기' }}</h3>
        <button class="ghost sm" @click="showForm = false">닫기</button>
      </div>
      <div class="form-grid">
        <label>세일 명칭
          <input v-model="form.name" type="text" placeholder="예: 도시락 마감 할인" />
        </label>
        <label>적용 점포 (비우면 전사)
          <input v-model.number="form.storeId" type="number" placeholder="비우면 전사 적용" />
        </label>
        <label class="inline-check">운영 상태 (활성화)
          <input v-model="form.isActive" type="checkbox" />
        </label>
        <label>세일 조건
          <select v-model="form.triggerType" @change="form.triggerCfgText = presetFor(form.triggerType)">
            <option value="shelf_life">유통기한 임박</option>
            <option value="weather">날씨</option>
            <option value="demand_drop">수요 하락</option>
            <option value="schedule">스케줄</option>
            <option value="manual">수동</option>
          </select>
        </label>
        <label>할인 및 혜택
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
          <tr>
            <th class="num-col">세일 번호</th>
            <th>세일 명칭</th>
            <th>세일 조건</th>
            <th>할인율 및 혜택</th>
            <th>운영 상태</th>
            <th class="manage-col">관리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pricing.rules" :key="r.id">
            <td class="num">#{{ r.id }}</td>
            <td class="name">{{ r.name }}</td>
            <td><span class="badge">{{ triggerLabel(r.triggerType) }}</span></td>
            <td><span class="badge benefit">{{ benefitLabel(r) }}</span></td>
            <td>
              <span class="status-badge" :class="r.isActive ? 'on' : 'off'">
                ● {{ r.isActive ? '활성화 중' : '일시중지' }}
              </span>
            </td>
            <td class="manage-cell">
              <div class="manage-btns">
                <button class="mini" :disabled="!auth.isAdmin || evaluatingId === r.id" @click="evaluateNow(r.id)">
                  {{ evaluatingId === r.id ? '평가 중…' : '평가' }}
                </button>
                <button class="mini" :disabled="!auth.isAdmin" @click="editRule(r.id)">수정</button>
                <button class="mini danger" :disabled="!auth.isAdmin" @click="remove(r.id)">삭제</button>
              </div>
              <p v-if="!auth.isAdmin" class="manage-hint">열람 모드에서는 수정이 제한됩니다</p>
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
.subtitle { margin: 0.25rem 0 0; color: #64748d; font-size: 0.9rem; }

.card { background: #fff; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
h3 { margin: 0; font-size: 1.05rem; }

/* 상단 현황 위젯 */
.summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.metric-card {
  background: #fff; border-radius: 12px; padding: 1.1rem 1.25rem;
  box-shadow: 0 1px 3px rgba(15,23,42,0.06);
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
}
.metric-text { display: flex; flex-direction: column; gap: 0.4rem; }
.metric-label { font-size: 0.82rem; color: #64748d; font-weight: 600; }
.metric-value { font-size: 1.5rem; font-weight: 800; color: #1c1e54; letter-spacing: -0.01em; }
.metric-value.gain { color: #15803d; }
.metric-icon {
  flex-shrink: 0; width: 2.9rem; height: 2.9rem; border-radius: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #f1edff; color: #8b7fe8;
}
.metric-icon svg { width: 1.45rem; height: 1.45rem; }

/* 가격 규칙 추가 CTA */
.add-rule { background: #4434d4; padding: 0.6rem 1.1rem; border-radius: 10px; box-shadow: 0 2px 8px rgba(68,52,212,0.22); }
.add-rule:hover:not(:disabled) { background: #3a2cc0; }
.add-rule:disabled { background: #b8b2e6; box-shadow: none; cursor: not-allowed; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
.form-grid label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #3f5069; }
.form-grid .full { grid-column: 1 / -1; }
.form-grid input[type="text"], .form-grid input[type="number"], .form-grid select, .form-grid textarea {
  padding: 0.45rem 0.55rem; border: 1px solid #c7d2e0; border-radius: 4px; font-size: 0.9rem;
  font-family: inherit;
}
.form-grid textarea { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 0.82rem; }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }

.rules-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.rules-table th, .rules-table td { padding: 0.95rem 0.85rem; text-align: left; border-bottom: 1px solid #eef3f8; vertical-align: middle; }
.rules-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.rules-table tbody tr { transition: background 0.12s ease; }
.rules-table tbody tr:hover { background: #f5f3ff; }
.rules-table .num-col, .rules-table .num { text-align: left; font-variant-numeric: tabular-nums; }
.rules-table .num { color: #8a99af; }
.rules-table .name { font-weight: 600; color: #1c1e54; }
.rules-table .muted { color: #8a99af; }
.manage-col { text-align: right; }
.badge { background: #ebe9fe; color: #2e2b8c; padding: 0.18rem 0.6rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.badge.benefit { background: #e7e6fe; color: #4434d4; }

/* 운영 상태 뱃지 */
.status-badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.status-badge.on { background: #dcfce7; color: #15803d; }
.status-badge.off { background: #eef1f6; color: #8a99af; }

/* 관리 열 */
.manage-cell { text-align: right; }
.manage-btns { display: inline-flex; gap: 0.35rem; justify-content: flex-end; }
.mini { border: 1px solid #d4dae3; background: #f8fafc; color: #475569; padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.mini:hover:not(:disabled) { background: #eef1f6; }
.mini.danger { color: #b91c1c; border-color: #f1d5d5; }
.mini.danger:hover:not(:disabled) { background: #fef2f2; }
.mini:disabled { color: #b6bdc8; background: #f4f6f9; border-color: #e7ebf0; cursor: not-allowed; }
.manage-hint { margin: 0.35rem 0 0; font-size: 0.68rem; color: #aab3c0; }

button { font-family: inherit; cursor: pointer; }
button.primary { background: #533afd; color: #fff; border: none; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; }
button.primary:disabled { background: #8a99af; cursor: not-allowed; }
button.ghost { background: #fff; color: #0d253d; border: 1px solid #c7d2e0; padding: 0.45rem 0.85rem; border-radius: 6px; }
button.ghost.danger { color: #b91c1c; border-color: #fecaca; }
button.sm { padding: 0.3rem 0.6rem; font-size: 0.8rem; }

.error { color: #b91c1c; font-size: 0.85rem; margin: 0.5rem 0 0; }
.empty { padding: 1.5rem; text-align: center; color: #8a99af; }

.toast { background: #ecfdf5; color: #065f46; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.9rem; }

.form-grid .inline-check { flex-direction: row; align-items: center; gap: 0.5rem; }
.form-grid .inline-check input[type="checkbox"] { width: 1.05rem; height: 1.05rem; }

@media (max-width: 900px) {
  .summary-cards { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .rules-table { font-size: 0.82rem; }
  .rules-table th, .rules-table td { padding: 0.6rem 0.5rem; }
}
</style>
