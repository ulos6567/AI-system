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
  actionType: ActionType;
  isActive: boolean;
}>({
  id: null,
  storeId: storeId.value,
  name: '',
  triggerType: 'shelf_life',
  actionType: 'percent_off',
  isActive: true,
});

// 발동 조건 세부 설정 — 점주가 항목별로 쉽게 입력 (내부에서 JSON 설정으로 조립)
const tcfg = reactive({
  threshold_days: 1,        // 유통기한 임박
  min_rain_mm: 1,           // 날씨
  window_days: 7,           // 수요 하락
  min_drop_pct: 30,         // 수요 하락
  days_of_week: ['sat', 'sun'] as string[], // 스케줄
  start_hour: 17,           // 스케줄
  end_hour: 21,             // 스케줄
  productIds: '',           // 대상 상품 번호(쉼표 구분, 비우면 전체)
});
// 할인 내용 세부 설정
const acfg = reactive({
  percent: 30,              // % 할인 / 번들
  price: 1500,              // 고정가
  duration_hours: 4,        // 공통 적용 시간
});

const DOW = [
  { v: 'mon', l: '월' }, { v: 'tue', l: '화' }, { v: 'wed', l: '수' }, { v: 'thu', l: '목' },
  { v: 'fri', l: '금' }, { v: 'sat', l: '토' }, { v: 'sun', l: '일' },
];
function toggleDow(v: string): void {
  const i = tcfg.days_of_week.indexOf(v);
  if (i >= 0) tcfg.days_of_week.splice(i, 1);
  else tcfg.days_of_week.push(v);
}
function parseIds(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}
function resetCfgFields(): void {
  tcfg.threshold_days = 1; tcfg.min_rain_mm = 1; tcfg.window_days = 7; tcfg.min_drop_pct = 30;
  tcfg.days_of_week = ['sat', 'sun']; tcfg.start_hour = 17; tcfg.end_hour = 21; tcfg.productIds = '';
  acfg.percent = 30; acfg.price = 1500; acfg.duration_hours = 4;
}
function buildTriggerConfig(): Record<string, unknown> {
  const ids = parseIds(tcfg.productIds);
  const withIds = ids.length ? { product_master_ids: ids } : {};
  switch (form.triggerType) {
    case 'shelf_life': return { threshold_days: tcfg.threshold_days };
    case 'weather':    return { min_rain_mm: tcfg.min_rain_mm, ...withIds };
    case 'demand_drop':return { window_days: tcfg.window_days, min_drop_pct: tcfg.min_drop_pct, ...withIds };
    case 'schedule':   return { days_of_week: tcfg.days_of_week, start_hour: tcfg.start_hour, end_hour: tcfg.end_hour, ...withIds };
    case 'manual':     return {};
  }
}
function buildActionConfig(): Record<string, unknown> {
  if (form.actionType === 'fixed_price') return { price: acfg.price, duration_hours: acfg.duration_hours };
  return { percent: acfg.percent, duration_hours: acfg.duration_hours };
}
function loadCfgFields(t: Record<string, any>, a: Record<string, any>): void {
  resetCfgFields();
  if (typeof t.threshold_days === 'number') tcfg.threshold_days = t.threshold_days;
  if (typeof t.min_rain_mm === 'number') tcfg.min_rain_mm = t.min_rain_mm;
  if (typeof t.window_days === 'number') tcfg.window_days = t.window_days;
  if (typeof t.min_drop_pct === 'number') tcfg.min_drop_pct = t.min_drop_pct;
  if (Array.isArray(t.days_of_week)) tcfg.days_of_week = t.days_of_week.slice();
  if (typeof t.start_hour === 'number') tcfg.start_hour = t.start_hour;
  if (typeof t.end_hour === 'number') tcfg.end_hour = t.end_hour;
  if (Array.isArray(t.product_master_ids)) tcfg.productIds = t.product_master_ids.join(', ');
  if (typeof a.percent === 'number') acfg.percent = a.percent;
  if (typeof a.price === 'number') acfg.price = a.price;
  if (typeof a.duration_hours === 'number') acfg.duration_hours = a.duration_hours;
}

const formError = ref<string | null>(null);
const showForm = ref(false);

onMounted(async () => {
  await pricing.refreshRules(storeId.value);
});

function resetForm(): void {
  form.id = null;
  form.storeId = storeId.value;
  form.name = '';
  form.triggerType = 'shelf_life';
  form.actionType = 'percent_off';
  form.isActive = true;
  resetCfgFields();
  formError.value = null;
}

function editRule(id: number): void {
  const r = pricing.rules.find((x) => x.id === id);
  if (!r) return;
  form.id = r.id;
  form.storeId = r.storeId;
  form.name = r.name;
  form.triggerType = r.triggerType;
  form.actionType = r.actionType;
  form.isActive = !!r.isActive;
  loadCfgFields(asConfig(r.triggerConfig), asConfig(r.actionConfig));
  formError.value = null;
  showForm.value = true;
}

function startNew(): void {
  resetForm();
  showForm.value = true;
}

async function save(): Promise<void> {
  formError.value = null;
  if (!form.name.trim()) {
    formError.value = '할인 항목명을 입력하세요.';
    return;
  }
  const input: RuleInput = {
    storeId: form.storeId,
    name: form.name,
    triggerType: form.triggerType,
    triggerConfig: buildTriggerConfig(),
    actionType: form.actionType,
    actionConfig: buildActionConfig(),
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
  if (!confirm('해당 할인 품목을 삭제하시겠습니까?')) return;
  await pricing.deleteRule(id);
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
// actionConfig/triggerConfig 는 백엔드에서 JSON '문자열'로 내려올 수 있어
// 객체·문자열 어느 형태든 안전하게 객체로 정규화한다. (균일가/번들 0원·0% 버그의 근원)
function asConfig(v: unknown): Record<string, any> {
  if (v && typeof v === 'object') return v as Record<string, any>;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

// '할인율 및 혜택' — actionConfig 값을 사람이 읽는 문구로 정규화하여 노출
// config 값을 우선 사용하고, 비어 있을 때만 규칙 명칭의 숫자(예: '30% 타임세일')로 보정
function benefitLabel(r: { actionType: ActionType; actionConfig: Record<string, unknown> | null | string; name: string }): string {
  const c = asConfig(r.actionConfig);
  const numFromName = (suffix: RegExp): number => {
    const m = r.name.match(suffix);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  };
  const duration = Number(c.duration_hours) > 0 ? ` · ${Number(c.duration_hours)}시간` : '';
  if (r.actionType === 'fixed_price') {
    const price = Number(c.price) || numFromName(/([\d,]+)\s*원/);
    return `${price.toLocaleString()}원 균일가${duration}`;
  }
  if (r.actionType === 'bundle') {
    const pct = Number(c.percent) || numFromName(/(\d+)\s*%/);
    return `번들 ${pct}% 할인${duration}`;
  }
  const pct = Number(c.percent) || numFromName(/(\d+)\s*%/);
  return `${pct}% 할인${duration}`;
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
      >+ 할인 항목 추가</button>
    </header>

    <!-- 상단 현황 위젯 -->
    <section class="summary-cards">
      <div class="metric-card">
        <div class="metric-text">
          <span class="metric-label">진행 중인 할인 품목</span>
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
          <span class="metric-label">누적 성과</span>
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

    <section v-if="showForm" class="card form-card">
      <div class="card-header">
        <h3>{{ form.id ? `할인 항목 #${form.id} 수정` : '새 할인 항목 추가' }}</h3>
        <button class="ghost sm" @click="showForm = false">닫기</button>
      </div>
      <div class="form-grid">
        <label>할인 항목명
          <input v-model="form.name" type="text" placeholder="예: 도시락 마감 할인" />
        </label>
        <label>적용 점포 (비워두면 전체 매장)
          <input v-model.number="form.storeId" type="number" placeholder="비워두면 전체 매장에 적용" />
        </label>
        <label class="inline-check">바로 적용 (켜짐)
          <input v-model="form.isActive" type="checkbox" />
        </label>
        <label>할인 발동 조건
          <select v-model="form.triggerType">
            <option value="shelf_life">유통기한 임박</option>
            <option value="weather">날씨</option>
            <option value="demand_drop">수요 하락</option>
            <option value="schedule">스케줄</option>
            <option value="manual">수동</option>
          </select>
        </label>
        <label>할인 방식
          <select v-model="form.actionType">
            <option value="percent_off">% 할인</option>
            <option value="fixed_price">고정가</option>
            <option value="bundle">번들</option>
          </select>
        </label>

        <!-- 발동 조건 세부 설정 — 선택한 조건에 맞는 칸만 표시 -->
        <div class="full cfg-group">
          <span class="cfg-title">발동 조건 세부 설정</span>
          <div class="cfg-fields">
            <template v-if="form.triggerType === 'shelf_life'">
              <label class="cfg-field">유통기한 임박 기준
                <span class="with-unit"><input v-model.number="tcfg.threshold_days" type="number" min="0" /><i>일 전</i></span>
              </label>
            </template>
            <template v-else-if="form.triggerType === 'weather'">
              <label class="cfg-field">최소 강수량
                <span class="with-unit"><input v-model.number="tcfg.min_rain_mm" type="number" min="0" /><i>mm 이상</i></span>
              </label>
              <label class="cfg-field">대상 상품 번호 (선택)
                <input v-model="tcfg.productIds" type="text" placeholder="예: 4, 5, 6 (비우면 전체)" />
              </label>
            </template>
            <template v-else-if="form.triggerType === 'demand_drop'">
              <label class="cfg-field">기준 기간
                <span class="with-unit"><input v-model.number="tcfg.window_days" type="number" min="1" /><i>일</i></span>
              </label>
              <label class="cfg-field">최소 판매 하락률
                <span class="with-unit"><input v-model.number="tcfg.min_drop_pct" type="number" min="0" max="100" /><i>%</i></span>
              </label>
              <label class="cfg-field">대상 상품 번호 (선택)
                <input v-model="tcfg.productIds" type="text" placeholder="예: 1, 2, 3 (비우면 전체)" />
              </label>
            </template>
            <template v-else-if="form.triggerType === 'schedule'">
              <label class="cfg-field full-field">적용 요일
                <span class="dow-row">
                  <button
                    v-for="d in DOW" :key="d.v" type="button"
                    class="dow-chip" :class="{ on: tcfg.days_of_week.includes(d.v) }"
                    @click="toggleDow(d.v)"
                  >{{ d.l }}</button>
                </span>
              </label>
              <label class="cfg-field">시작 시각
                <span class="with-unit"><input v-model.number="tcfg.start_hour" type="number" min="0" max="23" /><i>시</i></span>
              </label>
              <label class="cfg-field">종료 시각
                <span class="with-unit"><input v-model.number="tcfg.end_hour" type="number" min="0" max="23" /><i>시</i></span>
              </label>
              <label class="cfg-field">대상 상품 번호 (선택)
                <input v-model="tcfg.productIds" type="text" placeholder="예: 11, 12, 13 (비우면 전체)" />
              </label>
            </template>
            <p v-else class="cfg-note">자동 발동 조건 없이 점주가 직접 적용하는 수동 방식입니다.</p>
          </div>
        </div>

        <!-- 할인 내용 세부 설정 -->
        <div class="full cfg-group">
          <span class="cfg-title">할인 내용 세부 설정</span>
          <div class="cfg-fields">
            <label v-if="form.actionType === 'fixed_price'" class="cfg-field">고정 판매가
              <span class="with-unit"><input v-model.number="acfg.price" type="number" min="0" step="100" /><i>원</i></span>
            </label>
            <label v-else class="cfg-field">{{ form.actionType === 'bundle' ? '묶음 할인율' : '할인율' }}
              <span class="with-unit"><input v-model.number="acfg.percent" type="number" min="0" max="100" /><i>%</i></span>
            </label>
            <label class="cfg-field">할인 적용 시간
              <span class="with-unit"><input v-model.number="acfg.duration_hours" type="number" min="1" /><i>시간</i></span>
            </label>
          </div>
        </div>
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
            <th class="num-col">할인 운영 번호</th>
            <th>할인 운영명</th>
            <th>할인 요건</th>
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
                ● {{ r.isActive ? '[ESL 연동 | 앱푸시 발송]' : '[비활성화]' }}
              </span>
            </td>
            <td class="manage-cell">
              <div class="manage-btns">
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

/* 발동 조건/할인 내용 세부 설정 — 항목별 쉬운 입력 */
.cfg-group { grid-column: 1 / -1; background: #f8f9fe; border: 1px solid #eceaf9; border-radius: 10px; padding: 0.9rem 1rem; }
.cfg-title { display: block; font-size: 0.82rem; font-weight: 700; color: #4434d4; margin-bottom: 0.7rem; }
.cfg-fields { display: flex; flex-wrap: wrap; gap: 0.75rem 1.1rem; align-items: flex-end; }
.cfg-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: #3f5069; font-weight: 600; }
.cfg-field.full-field { flex-basis: 100%; }
.cfg-field input[type="text"] { width: 13rem; }
.with-unit { display: inline-flex; align-items: center; gap: 0.4rem; }
.with-unit input { width: 5.5rem; padding: 0.45rem 0.55rem; border: 1px solid #c7d2e0; border-radius: 6px; font-size: 0.9rem; font-family: inherit; text-align: right; }
.with-unit i { font-style: normal; font-size: 0.82rem; color: #64748d; font-weight: 600; }
.cfg-note { margin: 0.1rem 0; font-size: 0.85rem; color: #64748d; }

/* 요일 선택 칩 */
.dow-row { display: inline-flex; gap: 0.3rem; flex-wrap: wrap; }
.dow-chip { width: 2.1rem; height: 2.1rem; border: 1px solid #d4dae3; background: #fff; color: #475569; border-radius: 8px; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.12s ease; }
.dow-chip:hover { border-color: #b7aef0; }
.dow-chip.on { background: #533afd; color: #fff; border-color: #533afd; }

.rules-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.rules-table th, .rules-table td { padding: 0.95rem 0.85rem; text-align: left; border-bottom: 1px solid #eef3f8; vertical-align: middle; }
.rules-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.rules-table tbody tr { transition: background 0.12s ease; }
.rules-table tbody tr:hover { background: #f5f3ff; }
.rules-table .num-col, .rules-table .num { text-align: center; font-variant-numeric: tabular-nums; }
.rules-table .num { color: #8a99af; }
/* 할인 운영명(2)·할인 요건(3)·운영 상태(5)·관리(6) 컬럼: 헤더와 데이터를 가운데 정렬로 통일 */
.rules-table th:nth-child(2), .rules-table td:nth-child(2),
.rules-table th:nth-child(3), .rules-table td:nth-child(3),
.rules-table th:nth-child(5), .rules-table td:nth-child(5),
.rules-table th:nth-child(6), .rules-table td:nth-child(6) { text-align: center; }
.rules-table .name { font-weight: 600; color: #1c1e54; }
.rules-table .muted { color: #8a99af; }
.manage-col { text-align: center; }
.badge { background: #ebe9fe; color: #2e2b8c; padding: 0.18rem 0.6rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.badge.benefit { background: #e7e6fe; color: #4434d4; }

/* 운영 상태 뱃지 */
.status-badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.status-badge.on { background: #dcfce7; color: #15803d; }
.status-badge.off { background: #eef1f6; color: #8a99af; }

/* 관리 열 */
.manage-cell { text-align: center; }
.manage-btns { display: inline-flex; gap: 0.35rem; justify-content: center; }
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
