<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

// 관리 액션 피드백
const flash = ref<string>('');

// 상단 현황판 (데모 지표)
const summary = [
  { label: '오늘의 기부/배송', value: '7건', tone: '', icon: 'box' },
  { label: '복지기관 기부 완료', value: '4건', tone: '', icon: 'heart' },
  { label: '단골 고객 배송 완료', value: '3건', tone: 'gain', icon: 'truck' },
];

// 실시간 기부 · 배송 접수 목록 (지역명·인명 배제, 거리·기관 종류만)
type Kind = 'donation' | 'delivery';
type Stage = 'wait' | 'moving' | 'done';
interface Receipt {
  kind: Kind;
  product: string;
  qty: string;
  dest: string;
  stage: Stage;
}
const receipts = ref<Receipt[]>([
  { kind: 'donation', product: '샌드위치 햄치즈', qty: '2개', dest: '인근 푸드뱅크 (지정 수령처)', stage: 'wait' },
  { kind: 'delivery', product: '삼다수 500ml 1박스', qty: '1박스', dest: '등록된 주소지 (매장 인근 400m)', stage: 'moving' },
  { kind: 'donation', product: '불고기 도시락', qty: '3개', dest: '지역아동센터 (지정 수령처)', stage: 'done' },
]);
const kindLabel: Record<Kind, string> = { donation: '복지기부', delivery: '단골배송' };
const stageLabel: Record<Stage, string> = { wait: '기부 대기', moving: '이동 중', done: '전달 완료' };

// 진행 상황을 다음 단계로 전진 (운영자 전용)
const STAGE_ORDER: Stage[] = ['wait', 'moving', 'done'];
function advanceStage(i: number): void {
  const r = receipts.value[i];
  const idx = STAGE_ORDER.indexOf(r.stage);
  if (idx < STAGE_ORDER.length - 1) {
    r.stage = STAGE_ORDER[idx + 1];
    flash.value = `${r.product} 진행 상황을 '${stageLabel[r.stage]}'(으)로 변경했습니다.`;
  }
}
// 접수 등록 폼
const showForm = ref(false);
const formError = ref('');
const newReceipt = reactive<Receipt>({ kind: 'donation', product: '', qty: '', dest: '', stage: 'wait' });

function openForm(): void {
  newReceipt.kind = 'donation';
  newReceipt.product = '';
  newReceipt.qty = '';
  newReceipt.dest = '';
  newReceipt.stage = 'wait';
  formError.value = '';
  showForm.value = true;
}
function submitForm(): void {
  if (!newReceipt.product.trim()) {
    formError.value = '접수 상품명을 입력하세요.';
    return;
  }
  receipts.value.push({
    kind: newReceipt.kind,
    product: newReceipt.product.trim(),
    qty: newReceipt.qty.trim() || '1개',
    dest: newReceipt.dest.trim() || '미지정',
    stage: newReceipt.stage,
  });
  flash.value = `${newReceipt.product.trim()} 접수를 등록했습니다.`;
  showForm.value = false;
}

// 인근 복지시설 지원 요청
interface SupportRequest {
  facility: string;
  message: string;
  priority: 'urgent' | 'ok';
  time: string;
}
const requests: SupportRequest[] = [
  { facility: '지정 노인복지관', message: '도시락, 김밥류 식사 대용품이 부족합니다.', priority: 'urgent', time: '방금 전' },
  { facility: '관내 푸드뱅크', message: '음료 및 우유류 상시 수거 중입니다.', priority: 'ok', time: '2시간 전' },
];
const priorityLabel: Record<SupportRequest['priority'], string> = { urgent: '우선 지원 필요', ok: '지원 가능' };

function assignSupply(q: SupportRequest): void {
  flash.value = `${q.facility}에 보낼 기부 물품 지정을 시작합니다.`;
}
</script>

<template>
  <div class="local-delivery-view">
    <header class="page-header">
      <div>
        <h2>로컬 상생 배송 관리</h2>
        <p class="subtitle">점포 #{{ storeId }} · 잉여 상품 기부와 단골 근거리 배송을 한 화면에서 관리합니다.</p>
      </div>
      <button class="primary add-btn" :disabled="!auth.isAdmin" :title="!auth.isAdmin ? '운영자 권한 필요' : ''" @click="openForm">
        + 접수 등록
      </button>
    </header>

    <p v-if="flash" class="flash">✓ {{ flash }}</p>

    <!-- 접수 등록 폼 -->
    <section v-if="showForm" class="card form-card">
      <div class="card-header form-head">
        <h3>새 기부 · 배송 접수 등록</h3>
        <button class="close-btn" @click="showForm = false">닫기</button>
      </div>
      <div class="form-grid">
        <label>구분
          <select v-model="newReceipt.kind">
            <option value="donation">복지기부</option>
            <option value="delivery">단골배송</option>
          </select>
        </label>
        <label>진행 상황
          <select v-model="newReceipt.stage">
            <option value="wait">기부 대기</option>
            <option value="moving">이동 중</option>
            <option value="done">전달 완료</option>
          </select>
        </label>
        <label>수량
          <input v-model="newReceipt.qty" type="text" placeholder="예: 2개 / 1박스" />
        </label>
        <label class="full">접수 상품
          <input v-model="newReceipt.product" type="text" placeholder="예: 샌드위치 햄치즈" @keyup.enter="submitForm" />
        </label>
        <label class="full">목적지 / 배송 거리
          <input v-model="newReceipt.dest" type="text" placeholder="예: 인근 푸드뱅크 (지정 수령처)" @keyup.enter="submitForm" />
        </label>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
      <div class="form-actions">
        <button class="ghost" @click="showForm = false">취소</button>
        <button class="primary add-btn" @click="submitForm">등록</button>
      </div>
    </section>

    <!-- 상단 현황판 -->
    <section class="summary-cards">
      <div v-for="s in summary" :key="s.label" class="metric-card">
        <div class="metric-text">
          <span class="metric-label">{{ s.label }}</span>
          <strong class="metric-value" :class="s.tone">{{ s.value }}</strong>
        </div>
        <span class="metric-icon" :class="{ green: s.tone === 'gain' }">
          <!-- 상자/기부 -->
          <svg v-if="s.icon === 'box'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21 8-9-5-9 5v8l9 5 9-5V8Z" />
            <path d="m3 8 9 5 9-5" />
            <path d="M12 13v8" />
          </svg>
          <!-- 하트/건물 -->
          <svg v-else-if="s.icon === 'heart'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.8 6.6a4.6 4.6 0 0 0-7-.6L12 7.8l-1.8-1.8a4.6 4.6 0 1 0-6.5 6.5L12 21l8.3-8.5a4.6 4.6 0 0 0 .5-5.9Z" />
          </svg>
          <!-- 트럭/체크 -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 17V5a1 1 0 0 0-1-1H2.5" />
            <path d="M14 9h4l3 3v5h-2" />
            <path d="M2 17h2" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
          </svg>
        </span>
      </div>
    </section>

    <!-- 메인 2분할 -->
    <div class="main-grid">
      <!-- 좌측: 접수 목록 -->
      <section class="card col-left">
        <div class="card-header"><h3>기부·배송 접수 목록</h3></div>
        <table class="receipt-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>접수 상품</th>
              <th class="center">수량</th>
              <th>목적지 / 배송 거리</th>
              <th class="center">진행 상황</th>
              <th class="center">관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in receipts" :key="i">
              <td><span class="kind" :class="r.kind">{{ kindLabel[r.kind] }}</span></td>
              <td class="product">
                {{ r.product }}
                <span v-if="r.kind === 'donation'" class="unsold-tag">[타임세일 미판매분]</span>
              </td>
              <td class="center qty">{{ r.qty }}</td>
              <td class="dest">{{ r.dest }}</td>
              <td class="center"><span class="stage" :class="r.stage"><span class="dot"></span>{{ stageLabel[r.stage] }}</span></td>
              <td class="center">
                <button
                  class="manage-btn"
                  :class="{ approve: r.stage === 'wait' }"
                  :disabled="!auth.isAdmin || r.stage === 'done'"
                  :title="!auth.isAdmin ? '운영자 권한 필요' : (r.stage === 'done' ? '완료된 건' : (r.stage === 'wait' ? '점주 최종 승인 후 배송 단계로 전환됩니다' : ''))"
                  @click="advanceStage(i)"
                >{{ r.stage === 'done' ? '완료' : (r.stage === 'wait' ? '최종 승인' : '상태 변경') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 우측: 복지시설 지원 요청 -->
      <section class="card col-right">
        <div class="card-header"><h3>인근 복지시설 지원 요청</h3></div>
        <ul class="request-list">
          <li v-for="(q, i) in requests" :key="i" class="request-item">
            <div class="request-top">
              <div class="facility-group">
                <span class="facility">{{ q.facility }}</span>
                <span class="timestamp">{{ q.time }}</span>
              </div>
              <span class="priority" :class="q.priority">{{ priorityLabel[q.priority] }}</span>
            </div>
            <p class="request-msg">{{ q.message }}</p>
            <div class="request-foot">
              <button
                class="assign-btn"
                :disabled="!auth.isAdmin"
                :title="!auth.isAdmin ? '운영자 권한 필요' : ''"
                @click="assignSupply(q)"
              >기부 물품 지정</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.local-delivery-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.25rem 0 0; color: #64748d; font-size: 0.9rem; }

.add-btn {
  background: #4434d4; color: #fff; border: none; border-radius: 10px;
  padding: 0.6rem 1.1rem; font-size: 0.9rem; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px rgba(68, 52, 212, 0.2); transition: background 0.12s ease;
}
.add-btn:hover:not(:disabled) { background: #3a2cc0; }
.add-btn:disabled { background: #b8b2e6; box-shadow: none; cursor: not-allowed; }

.flash { margin: 0; color: #15803d; font-size: 0.86rem; font-weight: 600; }

/* 접수 등록 폼 */
.form-head { display: flex; align-items: center; justify-content: space-between; }
.close-btn { background: none; border: none; color: #64748b; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
.form-grid label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.82rem; color: #475569; font-weight: 600; }
.form-grid .full { grid-column: 1 / -1; }
.form-grid input, .form-grid select {
  padding: 0.5rem 0.6rem; border: 1px solid #d7deea; border-radius: 8px;
  font-size: 0.9rem; font-family: inherit; color: #1c1e54; font-weight: 500;
}
.form-grid input:focus, .form-grid select:focus { outline: none; border-color: #8b7fe8; }
.form-error { margin: 0.6rem 0 0; color: #d9533b; font-size: 0.82rem; font-weight: 600; }
.form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
.ghost { background: #fff; color: #0d253d; border: 1px solid #d7deea; border-radius: 10px; padding: 0.6rem 1.1rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; }

.manage-btn {
  background: #f5f3ff; color: #533afd; border: 1px solid #ddd9fb; border-radius: 8px;
  padding: 0.3rem 0.65rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;
  transition: background 0.12s ease;
}
.manage-btn:hover:not(:disabled) { background: #e7e3ff; }
.manage-btn:disabled { background: #f4f6f9; color: #b6bdc8; border-color: #e7ebf0; opacity: 0.7; cursor: not-allowed; }
/* 기부 대기 행 — 점주 최종 승인(인간 제어권) 강조: 채워진 강조 버튼 + 은은한 펄스 */
.manage-btn.approve { background: #4434d4; color: #fff; border-color: #4434d4; box-shadow: 0 0 0 0 rgba(68, 52, 212, 0.4); animation: approve-pulse 1.8s ease-in-out infinite; }
.manage-btn.approve:hover:not(:disabled) { background: #3a2cc0; border-color: #3a2cc0; }
@keyframes approve-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(68, 52, 212, 0.35); }
  50% { box-shadow: 0 0 0 4px rgba(68, 52, 212, 0); }
}

/* 부드러운 고급 그림자 토큰 */
/* 상단 현황판 */
.summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.metric-card {
  background: #fff; border: 1px solid #f0f2f7; border-radius: 14px; padding: 1.3rem 1.45rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 16px rgba(15, 23, 42, 0.04);
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
}
.metric-text { display: flex; flex-direction: column; gap: 0.45rem; }
.metric-label { font-size: 0.82rem; color: #64748d; font-weight: 600; }
.metric-value { font-size: 1.6rem; font-weight: 800; color: #1c1e54; letter-spacing: -0.01em; }
.metric-value.gain { color: #15803d; }
.metric-icon {
  flex-shrink: 0; width: 2.9rem; height: 2.9rem; border-radius: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #f1edff; color: #8b7fe8;
}
.metric-icon.green { background: #ecfdf5; color: #15803d; }
.metric-icon svg { width: 1.45rem; height: 1.45rem; }

/* 메인 2분할 (12열 그리드) */
.main-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1.5rem; align-items: start; }
.col-left { grid-column: span 7; overflow-x: auto; }
.col-right { grid-column: span 5; }
.card { background: #fff; border: 1px solid #f0f2f7; border-radius: 14px; padding: 1.5rem; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 16px rgba(15, 23, 42, 0.04); }
.card-header { margin-bottom: 1rem; }
.card-header h3 { margin: 0; font-size: 1.05rem; color: #1c1e54; }

/* 접수 목록 테이블 */
.receipt-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.receipt-table th, .receipt-table td { padding: 0.95rem 0.85rem; text-align: left; border-bottom: 1px solid #eef3f8; vertical-align: middle; white-space: nowrap; }
.receipt-table thead th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 14px; }
.receipt-table th.center, .receipt-table td.center { text-align: center; }
/* 구분 컬럼: 헤더 '구분'과 복지기부/단골배송 뱃지를 가운데로 정렬 통일 */
.receipt-table th:first-child, .receipt-table td:first-child { text-align: center; }
.receipt-table tbody tr:last-child td { border-bottom: none; }
.receipt-table tbody tr { transition: background 0.12s ease; }
.receipt-table tbody tr:hover td { background: rgba(248, 250, 252, 0.8); }
.product { font-weight: 700; color: #1c1e54; }
/* 타임세일 미판매분 — 가격 인하 후에도 안 팔린 잉여분이 기부로 흐르는 Closed-Loop 표식 */
.unsold-tag { margin-left: 0.4rem; font-size: 0.7rem; font-weight: 600; color: #b45309; background: #fff7ed; border: 1px solid #fde6c8; padding: 0.05rem 0.4rem; border-radius: 6px; white-space: nowrap; vertical-align: middle; }
.qty { font-variant-numeric: tabular-nums; color: #334155; }
.dest { color: #475569; }

/* 구분 뱃지 */
.kind { display: inline-block; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
.kind.donation { background: #f1edff; color: #6b46c1; }  /* 복지기부 — 연보라 */
.kind.delivery { background: #e0eafe; color: #2b4ad6; }  /* 단골배송 — 연블루 */

/* 진행 상황 뱃지 + 상태 점 */
.stage { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
.stage .dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; flex-shrink: 0; }
.stage.wait { background: #eef1f6; color: #64748b; }     /* 기부 대기 — 회색 */
.stage.wait .dot { background: #94a3b8; }
.stage.moving { background: #fef3c7; color: #92400e; }   /* 이동 중 — 노랑 */
.stage.moving .dot { background: #f59e0b; animation: pulse-dot 1.2s ease-in-out infinite; }
.stage.done { background: #dcfce7; color: #15803d; }     /* 전달 완료 — 초록 */
.stage.done .dot { background: #22c55e; }
@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
  50% { opacity: 0.55; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0); }
}

/* 복지시설 지원 요청 리스트 */
.request-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.85rem; }
.request-item {
  border: 1px solid #eef1f6; border-radius: 12px; padding: 1.05rem 1.15rem;
  display: flex; flex-direction: column; gap: 0.55rem;
  border-left: 4px solid #533afd;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}
.request-item:has(.priority.urgent) { border-left-color: #f56b51; }
.request-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.facility-group { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
.facility { font-weight: 700; color: #1c1e54; font-size: 0.95rem; }
.timestamp { font-size: 0.72rem; color: #aab3c0; font-weight: 500; white-space: nowrap; }
.request-msg { margin: 0; color: #475569; font-size: 0.88rem; line-height: 1.55; }
.priority { padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
.priority.urgent { background: #ffe4df; color: #d9533b; }  /* 우선 지원 필요 — 코랄 */
.priority.ok { background: #eef1f6; color: #64748b; }      /* 지원 가능 — 회색 */

.request-foot { display: flex; justify-content: flex-end; margin-top: 0.15rem; }
.assign-btn {
  background: #f1edff; color: #4434d4; border: none; border-radius: 8px;
  padding: 0.35rem 0.7rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;
  transition: background 0.12s ease;
}
.assign-btn:hover:not(:disabled) { background: #e3ddfb; }
.assign-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 900px) {
  .summary-cards { grid-template-columns: 1fr; }
  .col-left, .col-right { grid-column: span 12; }
}
</style>
