<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { inventoryApi } from '@/api/inventory';
import { storeLocalName } from '@/utils/productName';
import { loadProductMappings, registeredMasterIds } from '@/utils/productMappings';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

// 관리 액션 피드백
const flash = ref<string>('');

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
  // 복지기부
  { kind: 'donation', product: '불고기 도시락', qty: '8개', dest: '지정 노인복지관 (도보 6분)', stage: 'done' },
  { kind: 'donation', product: '참치 삼각김밥', qty: '12개', dest: '지정 아동복지센터 (차량 4분)', stage: 'done' },
  { kind: 'donation', product: '샌드위치 햄치즈', qty: '2개', dest: '인근 지정 기부처', stage: 'wait' },
  { kind: 'donation', product: '전주비빔 삼각김밥', qty: '15개', dest: '지정 무료급식소 (도보 5분)', stage: 'moving' },
  // 단골배송
  { kind: 'delivery', product: '삼다수 500ml 1박스', qty: '1박스', dest: '등록된 주소지 (매장 인근 400m)', stage: 'done' },
  { kind: 'delivery', product: '바나나우유', qty: '6개', dest: '등록된 주소지 (매장 인근 650m)', stage: 'done' },
  { kind: 'delivery', product: '제육 도시락', qty: '3개', dest: '등록된 주소지 (매장 인근 300m)', stage: 'moving' },
]);

// 상단 현황판 — 접수 목록에서 실시간 집계(고정값 아님).
//   · 오늘의 기부/배송 = 전체 접수 건수
//   · 복지기관 기부 완료 = 복지기부 중 전달 완료
//   · 단골 고객 배송 완료 = 단골배송 중 전달 완료
const summary = computed(() => {
  const all = receipts.value;
  const donationDone = all.filter((r) => r.kind === 'donation' && r.stage === 'done').length;
  const deliveryDone = all.filter((r) => r.kind === 'delivery' && r.stage === 'done').length;
  return [
    { label: '오늘의 기부/배송', value: `${all.length}건`, tone: '', icon: 'box' },
    { label: '복지기관 기부 완료', value: `${donationDone}건`, tone: '', icon: 'heart' },
    { label: '단골 고객 배송 완료', value: `${deliveryDone}건`, tone: 'gain', icon: 'truck' },
  ];
});
const kindLabel: Record<Kind, string> = { donation: '복지기부', delivery: '단골배송' };
const stageLabel: Record<Stage, string> = { wait: '상품 준비중', moving: '배송 접수', done: '전달 완료' };

// 상태 변경 드롭다운 (운영자 전용) — 어떤 행의 메뉴가 열려 있는지
const openMenu = ref<number | null>(null);
function toggleMenu(i: number): void {
  openMenu.value = openMenu.value === i ? null : i;
}
function setStage(i: number, stage: Stage): void {
  const r = receipts.value[i];
  r.stage = stage;
  openMenu.value = null;
  flash.value = stage === 'done'
    ? `${r.product} 전달 확인 및 최종 승인 완료 — '전달 완료'로 변경했습니다.`
    : `${r.product} 진행 상황을 '${stageLabel[stage]}'(으)로 변경했습니다.`;
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
type ReqStatus = 'pending' | 'accepted';
interface SupportItem {
  name: string;    // 요청 품목
  need: string;    // 필요 수량
  matched: string; // 매칭된 잉여/임박 재고
}
interface SupportRequest {
  id: number;
  facility: string;
  facilityType: string;   // 기관 유형
  distance: string;       // 매장 기준 거리
  supportType: string;    // 지원 형태(정기 수거 / 긴급 지원)
  preferredCats: string[]; // 요청 품목 카테고리(매칭은 이 카테고리 위주로 구성)
  message: string;
  priority: 'urgent' | 'ok';
  time: string;
  pickupWindow: string;   // 수거 가능 시간대
  estValue: string;       // 예상 지원 가치
  items: SupportItem[];
}
const requests = ref<SupportRequest[]>([
  {
    id: 1,
    facility: '지정 노인복지관',
    facilityType: '노인복지관',
    distance: '도보 6분 · 약 450m',
    supportType: '1회 긴급 지원',
    preferredCats: ['lunchbox', 'ricesnack'],
    message: '도시락, 김밥류 식사 대용품이 부족합니다.',
    priority: 'urgent',
    time: '방금 전',
    pickupWindow: '오늘 18:00 – 20:00',
    estValue: '약 48,000원',
    items: [
      { name: '불고기 도시락', need: '10개', matched: '타임세일 미판매분 14개' },
      { name: '참치 삼각김밥', need: '20개', matched: '당일 미판매분 26개' },
    ],
  },
  {
    id: 2,
    facility: '지정 아동복지센터',
    facilityType: '아동복지센터',
    distance: '차량 4분 · 약 1.2km',
    supportType: '정기 수거 (주 5회)',
    preferredCats: ['beverage'],
    message: '음료 및 우유류 상시 수거 중입니다.',
    priority: 'ok',
    time: '2시간 전',
    pickupWindow: '평일 16:00 – 17:00',
    estValue: '약 26,000원',
    items: [
      { name: '딸기우유', need: '20개', matched: '유통기한 임박분 28개' },
      { name: '바나나우유', need: '20개', matched: '당일 미판매분 26개' },
    ],
  },
]);
const priorityLabel: Record<SupportRequest['priority'], string> = { urgent: '우선 지원 필요', ok: '지원 가능' };

// 상황에 따라 추가로 유입되는 대기 중 지원 요청 풀(승인으로 자리가 비면 순차 접수)
const backlog = ref<SupportRequest[]>([
  {
    id: 3,
    facility: '지정 장애인복지관',
    facilityType: '장애인복지관',
    distance: '도보 9분 · 약 700m',
    supportType: '1회 긴급 지원',
    preferredCats: ['instant', 'snack'],
    message: '간편식·간식류 지원이 필요합니다.',
    priority: 'urgent',
    time: '방금 전',
    pickupWindow: '오늘 19:00 – 21:00',
    estValue: '약 31,000원',
    items: [
      { name: '신라면 컵', need: '12개', matched: '유통기한 임박분 18개' },
      { name: '초코파이', need: '12개', matched: '당일 미판매분 16개' },
    ],
  },
  {
    id: 4,
    facility: '지정 지역아동센터',
    facilityType: '지역아동센터',
    distance: '차량 6분 · 약 1.8km',
    supportType: '정기 수거 (주 5회)',
    preferredCats: ['snack', 'beverage'],
    message: '간식·음료류 상시 수거 가능합니다.',
    priority: 'ok',
    time: '방금 전',
    pickupWindow: '평일 15:00 – 16:30',
    estValue: '약 19,000원',
    items: [
      { name: '바나나우유', need: '20개', matched: '당일 미판매분 26개' },
      { name: '단백질 에너지바', need: '15개', matched: '유통기한 임박분 20개' },
    ],
  },
  {
    id: 5,
    facility: '지정 무료급식소',
    facilityType: '무료급식소',
    distance: '도보 5분 · 약 350m',
    supportType: '1회 긴급 지원',
    preferredCats: ['lunchbox', 'ricesnack', 'instant'],
    message: '도시락·삼각김밥 등 즉석식이 부족합니다.',
    priority: 'urgent',
    time: '방금 전',
    pickupWindow: '오늘 17:30 – 19:00',
    estValue: '약 54,000원',
    items: [
      { name: '제육 도시락', need: '10개', matched: '타임세일 미판매분 16개' },
      { name: '전주비빔 삼각김밥', need: '20개', matched: '당일 미판매분 28개' },
    ],
  },
]);

// 지원 요청 진행 상태(요청 id 기준) — pending(대기) → accepted(수락·검토)
const reqStatus = ref<Record<number, ReqStatus>>({});
function statusOf(id: number): ReqStatus {
  return reqStatus.value[id] ?? 'pending';
}
// 발주 관리 '실시간 재고 현황'과 동일하게 — 상품 코드 관리에 등록된 점포 지정 상품 중
// 유통기한 임박 재고를 기부 매칭 풀로 사용한다(잉여→기부 Closed-Loop의 단일 출처).
interface NearExpiryItem { name: string; cat: string; id: number; qty: number; days: number; ddayLabel: string; }
const nearExpiryPool = ref<NearExpiryItem[]>([]);
async function loadNearExpiry(): Promise<void> {
  try {
    const [inv, mappings] = await Promise.all([
      inventoryApi.list(storeId.value),
      loadProductMappings(storeId.value),
    ]);
    const reg = registeredMasterIds(mappings);
    // 등록 상품 중 재고 보유분을 임박순으로 정렬해 후보 풀로 둔다.
    // (카테고리 매칭 시 각 카테고리의 가장 임박한 재고부터 골라 '임박 위주'를 유지)
    const available = inv.items
      .filter(
        (it) =>
          (reg.size === 0 || reg.has(it.productMasterId)) &&
          it.quantity > 0 &&
          it.daysToExpiry !== null &&
          it.daysToExpiry >= 0,
      )
      .sort((a, b) => (a.daysToExpiry as number) - (b.daysToExpiry as number));
    nearExpiryPool.value = available.map((it) => {
      const days = it.daysToExpiry as number;
      return {
        name: storeLocalName(it.productMasterId, it.productName),
        cat: it.category,
        id: it.productMasterId,
        qty: it.quantity,
        days,
        ddayLabel: days === 0 ? '오늘 만료' : `D-${days}`,
      };
    });
  } catch {
    /* 재고 로드 실패 시 기존 정적 품목으로 폴백 */
  }
}

// 카테고리별 현실적인 필요수량 상한 (도시락·덮밥 10, 삼각김밥 20, 우유 등 음료 20, 나머지 현실값)
const NEED_CAP: Record<string, number> = {
  lunchbox: 10,  // 도시락·덮밥
  ricesnack: 20, // 삼각김밥·주먹밥
  beverage: 20,  // 우유 등 음료
  instant: 15,   // 컵라면 등 즉석식품
  snack: 15,     // 간식
  frozen: 12,    // 냉동
};
// 상한 내에서 결정적으로 현실적인 필요수량 산출(품목별로 약간씩 분산, 재고 한도 내)
function realisticNeed(cat: string, available: number, salt: number): number {
  const max = NEED_CAP[cat] ?? 12;
  const min = Math.max(5, Math.ceil(max * 0.6)); // 너무 적지 않게 하한
  const span = max - min;
  const val = span > 0 ? min + (salt % (span + 1)) : max;
  return Math.min(val, available);
}

// 카테고리별 대표 단가(원) — 시드 단가 분포 기준의 현실적 평균값.
// (product_master 에 단가 컬럼이 없어 예상 지원 가치 산정용 근사 단가로 사용)
const CAT_UNIT_PRICE: Record<string, number> = {
  lunchbox: 4000,  // 도시락·덮밥
  ricesnack: 1300, // 삼각김밥·주먹밥
  beverage: 1700,  // 우유 등 음료
  instant: 1300,   // 컵라면 등 즉석식품
  snack: 1700,     // 간식
  frozen: 1300,    // 냉동
};

// 기부 요청 매칭 품목 생성 — 요청 품목 카테고리(preferredCats) 위주로,
// 각 카테고리에서 가장 임박한 재고부터 배정한다(요청 메시지와 품목이 어긋나지 않도록).
// 예상 지원 가치는 매칭 수량 × 카테고리 단가의 합으로 산정한다(품목·수량과 정합).
function buildDonation(q: SupportRequest): { items: SupportItem[]; estValue: string } {
  const pool = nearExpiryPool.value;
  if (!pool.length) return { items: [], estValue: q.estValue };
  // 요청 카테고리 우선 + 필요 수량보다 잉여 재고가 많은(충분 재고) 품목을 앞세운다.
  const inCat = (p: NearExpiryItem) => q.preferredCats.includes(p.cat);
  const hasSurplus = (p: NearExpiryItem) => p.qty > (NEED_CAP[p.cat] ?? 12);
  const preferred = pool.filter(inCat);
  const base =
    preferred.filter(hasSurplus).length ? preferred.filter(hasSurplus)
    : preferred.length ? preferred
    : pool.filter(hasSurplus).length ? pool.filter(hasSurplus)
    : pool;
  const count = Math.min(3, base.length);
  const start = base.length ? q.id % base.length : 0;
  const out: SupportItem[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let k = 0; k < base.length && out.length < count; k++) {
    const p = base[(start + k) % base.length];
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    const need = realisticNeed(p.cat, p.qty, q.id + p.id);
    // 매칭 잉여 재고는 필요 수량보다 여유 있게 배정(단, 실제 재고 수량을 넘지 않음)
    const margin = 3 + ((q.id + p.id) % 8); // 3~10개 여유분
    const matchedQty = Math.min(p.qty, need + margin);
    total += matchedQty * (CAT_UNIT_PRICE[p.cat] ?? 1500);
    const sourceLabel = p.days <= 3 ? '유통기한 임박분' : '잉여 재고분';
    out.push({
      name: p.name,
      need: `${need}개`,
      matched: `${sourceLabel} ${matchedQty}개 (${p.ddayLabel})`,
    });
  }
  const rounded = Math.round(total / 100) * 100; // 100원 단위 반올림('약' 표기)
  return { items: out, estValue: `약 ${rounded.toLocaleString('ko-KR')}원` };
}

// 1단계: 운영자가 요청을 수락하면 상세 검토 패널이 펼쳐짐
// (기부 요청은 유통기한 임박 재고 기준으로 매칭 품목을 구성)
function acceptRequest(q: SupportRequest): void {
  const built = buildDonation(q);
  if (built.items.length) {
    q.items = built.items;
    q.estValue = built.estValue; // 매칭된 품목·수량 기준으로 예상 지원 가치 재산정
  }
  reqStatus.value = { ...reqStatus.value, [q.id]: 'accepted' };
  flash.value = `${q.facility}의 지원 요청을 수락했습니다. 유통기한 임박 재고 기준 매칭 물품을 확인하고 최종 승인하세요.`;
}
// 수락 취소 → 다시 대기 상태로 되돌림 (상세 패널 닫힘)
function cancelAccept(q: SupportRequest): void {
  const next = { ...reqStatus.value };
  delete next[q.id];
  reqStatus.value = next;
  flash.value = `${q.facility}의 지원 요청 수락을 취소했습니다.`;
}
// 2단계: 점주 최종 승인 → 접수 목록 즉시 반영 + 피드에서 해당 요청 제거(Closed-Loop)
function confirmRequest(q: SupportRequest): void {
  q.items.forEach((it) => {
    receipts.value.unshift({
      kind: 'donation',
      product: it.name,
      qty: it.matched,
      dest: `${q.facility} (${q.distance})`,
      stage: 'wait',
    });
  });
  // 피드에서 제거 + 상태 정리
  requests.value = requests.value.filter((r) => r.id !== q.id);
  const next = { ...reqStatus.value };
  delete next[q.id];
  reqStatus.value = next;
  flash.value = `${q.facility} 지원을 최종 승인했습니다. 매칭 물품 ${q.items.length}건이 기부 접수 목록에 등록되었습니다.`;
  // 상황에 따라 새 지원 요청 유입(자리가 비면 대기 풀에서 접수)
  window.setTimeout(spawnFromBacklog, 2600);
}

// 대기 풀에서 다음 요청을 피드로 끌어올림
function spawnFromBacklog(): void {
  const nextReq = backlog.value.shift();
  if (!nextReq) return;
  nextReq.time = '방금 전';
  requests.value.push(nextReq);
  flash.value = `새로운 지원 요청이 접수되었습니다 — ${nextReq.facility}`;
}

// 상황에 따라 피드가 비지 않도록 주기적으로 보충(데모: 일정 시간마다 점검)
let topUpTimer: number | undefined;
onMounted(() => {
  void loadNearExpiry();
  topUpTimer = window.setInterval(() => {
    if (requests.value.length < 2 && backlog.value.length > 0) spawnFromBacklog();
  }, 20000);
});
onBeforeUnmount(() => {
  if (topUpTimer) window.clearInterval(topUpTimer);
});
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
            <option value="wait">상품 준비중</option>
            <option value="moving">배송 접수</option>
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
          <input v-model="newReceipt.dest" type="text" placeholder="예: 인근 지정 기부처" @keyup.enter="submitForm" />
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
                <!-- 완료 건: 표시만 -->
                <span v-if="r.stage === 'done'" class="done-pill">완료</span>
                <!-- 그 외: 상태 변경 드롭다운 -->
                <div v-else class="manage-wrap">
                  <button
                    class="manage-btn"
                    :class="{ open: openMenu === i }"
                    :disabled="!auth.isAdmin"
                    :title="!auth.isAdmin ? '운영자 권한 필요' : '진행 단계를 변경합니다'"
                    @click.stop="toggleMenu(i)"
                  >상태 변경 <span class="caret">▾</span></button>
                  <template v-if="openMenu === i">
                    <div class="menu-backdrop" @click="openMenu = null"></div>
                    <div class="stage-menu" @click.stop>
                      <button class="stage-opt" :class="{ active: r.stage === 'wait' }" @click="setStage(i, 'wait')">
                        <span class="opt-dot wait"></span>상품 준비중
                      </button>
                      <button class="stage-opt" :class="{ active: r.stage === 'moving' }" @click="setStage(i, 'moving')">
                        <span class="opt-dot moving"></span>배송 접수
                      </button>
                      <button class="stage-opt confirm" @click="setStage(i, 'done')">
                        <span class="opt-dot done"></span>전달 확인 및 최종 승인
                      </button>
                    </div>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 우측: 복지시설 지원 요청 -->
      <section class="card col-right">
        <div class="card-header"><h3>인근 복지시설 지원 요청</h3></div>
        <ul v-if="requests.length" class="request-list">
          <li v-for="q in requests" :key="q.id" class="request-item" :class="{ open: statusOf(q.id) !== 'pending' }">
            <div class="request-top">
              <div class="facility-group">
                <span class="facility">{{ q.facility }}</span>
                <span class="timestamp">{{ q.time }}</span>
              </div>
              <span class="priority" :class="q.priority">{{ priorityLabel[q.priority] }}</span>
            </div>
            <p class="request-msg">{{ q.message }}</p>

            <!-- 수락 후 상세 검토 패널 -->
            <div v-if="statusOf(q.id) === 'accepted'" class="request-detail">
              <div class="detail-meta">
                <div class="meta-cell"><span class="meta-k">기관 유형</span><span class="meta-v">{{ q.facilityType }}</span></div>
                <div class="meta-cell"><span class="meta-k">거리</span><span class="meta-v">{{ q.distance }}</span></div>
                <div class="meta-cell"><span class="meta-k">지원 형태</span><span class="meta-v">{{ q.supportType }}</span></div>
                <div class="meta-cell"><span class="meta-k">수거 가능</span><span class="meta-v">{{ q.pickupWindow }}</span></div>
              </div>
              <table class="item-table">
                <thead>
                  <tr><th>요청 품목</th><th class="center">필요 수량</th><th>매칭된 잉여 재고</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(it, k) in q.items" :key="k">
                    <td class="item-name">{{ it.name }}</td>
                    <td class="center">{{ it.need }}</td>
                    <td class="item-matched">{{ it.matched }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="detail-foot">
                <span class="est-value">예상 지원 가치 <b>{{ q.estValue }}</b></span>
              </div>
            </div>

            <div class="request-foot">
              <!-- 1단계: 요청 수락 -->
              <button
                v-if="statusOf(q.id) === 'pending'"
                class="accept-btn"
                :disabled="!auth.isAdmin"
                :title="!auth.isAdmin ? '운영자 권한 필요' : ''"
                @click="acceptRequest(q)"
              >요청 수락</button>

              <!-- 2단계: 수락됨 + 최종 승인 -->
              <template v-else>
                <span class="status-chip accepted">수락됨 · 검토 중</span>
                <button
                  class="cancel-btn"
                  :disabled="!auth.isAdmin"
                  :title="!auth.isAdmin ? '운영자 권한 필요' : '수락을 취소하고 대기 상태로 되돌립니다'"
                  @click="cancelAccept(q)"
                >수락 취소</button>
                <button
                  class="confirm-btn"
                  :disabled="!auth.isAdmin"
                  :title="!auth.isAdmin ? '운영자 권한 필요' : '점주 최종 승인 시 기부 접수로 전환됩니다'"
                  @click="confirmRequest(q)"
                >최종 승인</button>
              </template>
            </div>
          </li>
        </ul>
        <!-- 빈 상태: 모든 요청 처리 완료 -->
        <div v-else class="request-empty">
          <span class="empty-check">✓</span>
          <p class="empty-title">현재 대기 중인 지원 요청이 없습니다</p>
          <p class="empty-sub">새로운 요청이 접수되면 이곳에 표시됩니다.</p>
        </div>
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

/* 완료 표시(버튼 아님) */
.done-pill {
  display: inline-block; padding: 0.3rem 0.7rem; border-radius: 999px;
  background: #dcfce7; color: #15803d; font-size: 0.75rem; font-weight: 700;
}

/* 상태 변경 드롭다운 */
.manage-wrap { position: relative; display: inline-block; }
.manage-btn {
  background: #f5f3ff; color: #533afd; border: 1px solid #ddd9fb; border-radius: 8px;
  padding: 0.3rem 0.65rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;
  transition: background 0.12s ease; display: inline-flex; align-items: center; gap: 0.3rem;
}
.manage-btn:hover:not(:disabled) { background: #e7e3ff; }
.manage-btn.open { background: #e7e3ff; }
.manage-btn:disabled { background: #f4f6f9; color: #b6bdc8; border-color: #e7ebf0; opacity: 0.7; cursor: not-allowed; }
.manage-btn .caret { font-size: 0.65rem; line-height: 1; }

.menu-backdrop { position: fixed; inset: 0; z-index: 20; }
.stage-menu {
  position: absolute; top: calc(100% + 0.35rem); right: 0; z-index: 21;
  background: #fff; border: 1px solid #e7ebf0; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); padding: 0.35rem;
  display: flex; flex-direction: column; gap: 0.15rem; min-width: 13rem;
  animation: detail-in 0.14s ease;
}
.stage-opt {
  display: flex; align-items: center; gap: 0.5rem; width: 100%;
  background: none; border: none; border-radius: 7px; cursor: pointer;
  padding: 0.5rem 0.6rem; font-size: 0.82rem; font-weight: 600; color: #334155;
  text-align: left; white-space: nowrap; transition: background 0.1s ease;
}
.stage-opt:hover { background: #f5f3ff; }
.stage-opt.active { background: #f1edff; color: #533afd; }
.stage-opt.confirm { color: #15803d; border-top: 1px solid #eef1f6; margin-top: 0.15rem; padding-top: 0.55rem; border-radius: 0 0 7px 7px; }
.stage-opt.confirm:hover { background: #ecfdf5; }
.opt-dot { width: 0.55rem; height: 0.55rem; border-radius: 999px; flex-shrink: 0; }
.opt-dot.wait { background: #94a3b8; }
.opt-dot.moving { background: #f59e0b; }
.opt-dot.done { background: #22c55e; }

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

.request-item.open { border-left-color: #15803d; }
.request-item.open:has(.priority.urgent) { border-left-color: #f56b51; }

/* 수락 후 상세 검토 패널 */
.request-detail {
  margin-top: 0.2rem; padding: 0.9rem 1rem; border-radius: 10px;
  background: #f8fafc; border: 1px solid #eef1f6;
  display: flex; flex-direction: column; gap: 0.8rem;
  animation: detail-in 0.18s ease;
}
@keyframes detail-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.detail-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem 1rem; }
.meta-cell { display: flex; flex-direction: column; gap: 0.15rem; }
.meta-k { font-size: 0.7rem; color: #94a3b8; font-weight: 600; }
.meta-v { font-size: 0.84rem; color: #1c1e54; font-weight: 600; }

.item-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.item-table th, .item-table td { padding: 0.45rem 0.5rem; text-align: left; border-bottom: 1px solid #eef3f8; }
.item-table thead th { color: #64748b; font-weight: 600; font-size: 0.74rem; border-bottom: 1px solid #e2e8f0; }
.item-table th.center, .item-table td.center { text-align: center; }
.item-table tbody tr:last-child td { border-bottom: none; }
.item-name { font-weight: 600; color: #1c1e54; }
.item-matched { color: #15803d; font-weight: 600; }

.detail-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.est-value { font-size: 0.8rem; color: #475569; }
.est-value b { color: #1c1e54; font-size: 0.9rem; }
.confirmed-note { font-size: 0.74rem; color: #15803d; font-weight: 700; }

.request-foot { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.15rem; }
/* 요청 수락 — 주 액션(채워진 버튼) */
.accept-btn {
  background: #4434d4; color: #fff; border: none; border-radius: 8px;
  padding: 0.35rem 0.8rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;
  transition: background 0.12s ease;
}
.accept-btn:hover:not(:disabled) { background: #3a2cc0; }
.accept-btn:disabled { cursor: not-allowed; background: #b8b2e6; }

/* 진행 상태 칩 */
.status-chip { padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
.status-chip.accepted { background: #fff7ed; color: #b45309; border: 1px solid #fde6c8; }

/* 빈 상태 */
.request-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.35rem; padding: 2.5rem 1rem; text-align: center;
}
.empty-check {
  width: 2.6rem; height: 2.6rem; border-radius: 999px; background: #ecfdf5; color: #15803d;
  display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800;
  margin-bottom: 0.35rem;
}
.empty-title { margin: 0; color: #1c1e54; font-size: 0.92rem; font-weight: 700; }
.empty-sub { margin: 0; color: #94a3b8; font-size: 0.8rem; }

/* 수락 취소 — 보조 액션(외곽선 버튼) */
.cancel-btn {
  background: #fff; color: #64748b; border: 1px solid #d7deea; border-radius: 8px;
  padding: 0.35rem 0.8rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.cancel-btn:hover:not(:disabled) { background: #fef2f2; color: #d9533b; border-color: #f3c6bd; }
.cancel-btn:disabled { cursor: not-allowed; opacity: 0.6; }

/* 최종 승인 — 인간 제어권 강조(채워진 강조 버튼 + 펄스) */
.confirm-btn {
  background: #15803d; color: #fff; border: none; border-radius: 8px;
  padding: 0.35rem 0.85rem; font-size: 0.75rem; font-weight: 700; cursor: pointer;
  transition: background 0.12s ease; box-shadow: 0 0 0 0 rgba(21, 128, 61, 0.4);
  animation: approve-pulse-green 1.8s ease-in-out infinite;
}
.confirm-btn:hover:not(:disabled) { background: #126633; }
.confirm-btn:disabled { cursor: not-allowed; background: #a7d3b6; animation: none; box-shadow: none; }
@keyframes approve-pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 rgba(21, 128, 61, 0.35); }
  50% { box-shadow: 0 0 0 4px rgba(21, 128, 61, 0); }
}

@media (max-width: 900px) {
  .summary-cards { grid-template-columns: 1fr; }
  .col-left, .col-right { grid-column: span 12; }
}
</style>
