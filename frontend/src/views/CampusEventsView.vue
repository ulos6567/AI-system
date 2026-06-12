<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import {
  campusApi,
  type UniversitySummary,
  type CampusEvent,
  type CampusPlay,
} from '@/api/campus';

const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);
const canWrite = computed(() => auth.isAdmin);

const universities = ref<UniversitySummary[]>([]);
const events = ref<CampusEvent[]>([]);
const plays = ref<CampusPlay[]>([]);
const summary = ref<{ total: number; activeFestival: number; activeExam: number; upcoming: number } | null>(null);

const loading = ref(false);
const lastError = ref<string | null>(null);
const actionMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);
const busyKey = ref<string | null>(null);
// AI 추천: 지역 필터 연동 로딩/범위 상태
const recoLoading = ref(false);
const recoScope = ref<'nearby' | 'filtered'>('nearby');

// 플레이별 편집중 재고 수량: key=`${eventId}:${inventoryId}` → 수량
const editQty = reactive<Record<string, number>>({});

const EVENT_LABEL: Record<string, string> = {
  festival: '축제',
  exam: '시험기간',
  vacation: '방학',
  entrance: '입학',
  orientation: 'OT',
};
const EVENT_ICON: Record<string, string> = {
  festival: '🎉',
  exam: '📚',
  vacation: '🏖️',
  entrance: '🎓',
  orientation: '🧭',
};

function qKey(eventId: number, inventoryId: number): string {
  return `${eventId}:${inventoryId}`;
}

// ── 전국 대학 검색·지역 필터 ──────────────────────────────────────────────
const UNI_LIMIT = 60; // 카드 과다 렌더 방지: 필터 결과 상위 N개만 표시
const EVENT_LIMIT = 150;
const regionFilter = ref('전체'); // 시·도
const districtFilter = ref('전체'); // 시·군·구 (구체적 2단계)
const search = ref('');
const calendarScope = ref<'current' | 'all'>('current'); // current=진행중·예정만

// 주소(시·도 시·군·구 동) 기준으로 지역 단계 추출
function uniTokens(u: UniversitySummary): string[] {
  return (u.address ?? u.region ?? '').trim().split(/\s+/).filter(Boolean);
}
function sidoOf(u: UniversitySummary): string {
  return uniTokens(u)[0] ?? '기타';
}
function districtOf(u: UniversitySummary): string {
  return uniTokens(u)[1] ?? '';
}
function sido(region: string | null): string {
  return region ? region.trim().split(/\s+/)[0] : '기타';
}
const regions = computed(() => {
  const set = new Set<string>();
  for (const u of universities.value) set.add(sidoOf(u));
  return ['전체', ...[...set].sort()];
});
// 선택한 시·도의 시·군·구 목록 (구체적 선택용)
const districts = computed(() => {
  if (regionFilter.value === '전체') return [] as string[];
  const set = new Set<string>();
  for (const u of universities.value) {
    if (sidoOf(u) === regionFilter.value && districtOf(u)) set.add(districtOf(u));
  }
  return ['전체', ...[...set].sort()];
});
watch(regionFilter, () => {
  districtFilter.value = '전체'; // 시·도 변경 시 시·군·구 초기화
});
const filteredUniversities = computed(() => {
  const q = search.value.trim().toLowerCase();
  return universities.value.filter((u) => {
    const okRegion = regionFilter.value === '전체' || sidoOf(u) === regionFilter.value;
    const okDistrict = districtFilter.value === '전체' || districtOf(u) === districtFilter.value;
    const okSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      (u.shortName ?? '').toLowerCase().includes(q) ||
      (u.address ?? u.region ?? '').toLowerCase().includes(q);
    return okRegion && okDistrict && okSearch;
  });
});
const displayUniversities = computed(() => filteredUniversities.value.slice(0, UNI_LIMIT));
const uniOverflow = computed(() => Math.max(0, filteredUniversities.value.length - UNI_LIMIT));
const nearbyCount = computed(() => universities.value.filter((u) => u.distanceKm != null).length);

const isFiltering = computed(() => regionFilter.value !== '전체' || search.value.trim().length > 0);
const uniNameSet = computed(() => new Set(filteredUniversities.value.map((u) => u.name)));
const filteredEvents = computed(() => {
  let evs = events.value;
  if (isFiltering.value) evs = evs.filter((e) => uniNameSet.value.has(e.universityName));
  if (calendarScope.value === 'current') evs = evs.filter((e) => e.status !== 'past');
  return evs;
});
const displayEvents = computed(() => filteredEvents.value.slice(0, EVENT_LIMIT));
const eventOverflow = computed(() => Math.max(0, filteredEvents.value.length - EVENT_LIMIT));

// 편집 버퍼를 추천 수량으로 초기화
function syncEditBuffer(): void {
  for (const key of Object.keys(editQty)) delete editQty[key];
  for (const p of plays.value) {
    for (const t of p.inventoryTargets) {
      editQty[qKey(p.eventId, t.inventoryId)] = t.suggestedQty;
    }
  }
}

// 현재 추천이 보고 있는 지역 라벨(화면 표시용)
const recoScopeLabel = computed(() => {
  if (recoScope.value !== 'filtered') return '점포 인근 연계 대학';
  const parts = [regionFilter.value !== '전체' ? regionFilter.value : '', districtFilter.value !== '전체' ? districtFilter.value : ''].filter(Boolean);
  const region = parts.join(' ');
  if (search.value.trim()) return `${region ? region + ' · ' : ''}"${search.value.trim()}" 검색`;
  return region || '선택 지역';
});

// 추천만 (재)조회 — 지역 필터가 적용돼 있으면 해당 지역 대학 기준으로 추천을 받는다.
async function loadRecommendations(): Promise<void> {
  recoLoading.value = true;
  try {
    const ids = isFiltering.value ? filteredUniversities.value.slice(0, 25).map((u) => u.id) : undefined;
    const r = await campusApi.recommendations(storeId.value, ids);
    plays.value = r.plays;
    recoScope.value = r.scope;
    syncEditBuffer();
  } catch (err: any) {
    actionMsg.value = { kind: 'err', text: `추천 조회 실패: ${err?.message ?? 'error'}` };
  } finally {
    recoLoading.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  lastError.value = null;
  try {
    const [u, c] = await Promise.all([
      campusApi.universities(storeId.value),
      campusApi.calendar(storeId.value),
    ]);
    universities.value = u.universities;
    events.value = c.events;
    summary.value = c.summary;
    await loadRecommendations();
  } catch (err: any) {
    lastError.value = err?.message ?? 'failed';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// 지역·검색 필터를 바꾸면 추천도 그 지역 기준으로 자동 전환(검색 입력은 디바운스).
let recoTimer: ReturnType<typeof setTimeout> | null = null;
watch([regionFilter, districtFilter, search], () => {
  if (loading.value) return; // 최초 로딩은 load()가 직접 호출
  if (recoTimer) clearTimeout(recoTimer);
  recoTimer = setTimeout(() => void loadRecommendations(), 250);
});

function dday(daysUntilStart: number): string {
  if (daysUntilStart <= 0) return '진행중';
  return `D-${daysUntilStart}`;
}
// 시험기간에는 통금이 풀린다 — 연장(시간 표시) 또는 24시간 개방(해제)로 명확히 표기
function curfewText(ev: { eventType: string; curfewTime: string | null }): string {
  if (ev.eventType === 'exam') return ev.curfewTime ? `🔓 ${ev.curfewTime} 연장` : '🔓 해제(24h)';
  return ev.curfewTime ?? '없음';
}

function changedTargets(p: CampusPlay): Array<{ inventoryId: number; quantity: number }> {
  return p.inventoryTargets
    .map((t) => ({ inventoryId: t.inventoryId, quantity: editQty[qKey(p.eventId, t.inventoryId)] ?? t.currentQty }))
    .filter((a, i) => a.quantity !== p.inventoryTargets[i].currentQty && Number.isFinite(a.quantity));
}

function resetToSuggested(p: CampusPlay): void {
  for (const t of p.inventoryTargets) editQty[qKey(p.eventId, t.inventoryId)] = t.suggestedQty;
}

async function promote(p: CampusPlay): Promise<void> {
  if (!p.promotion || !canWrite.value) return;
  busyKey.value = `promo:${p.eventId}`;
  actionMsg.value = null;
  try {
    const res = await campusApi.promote(storeId.value, {
      academicEventId: p.eventId,
      label: `[${p.universityShortName ?? p.universityName}] ${p.promotion.label}`,
      categories: p.promotion.categories,
      discountPct: p.promotion.discountPct,
      startDate: p.startDate,
      endDate: p.endDate,
      mechanic: p.promotion.mechanic,
      bundles: p.promotion.bundles,
      channels: p.promotion.channels,
      expectedUpliftPct: p.promotion.expectedUpliftPct,
    });
    actionMsg.value = {
      kind: 'ok',
      text: `이벤트 추진 완료 — "${p.promotion.label}" (이벤트로그 #${res.eventLogId})`,
    };
  } catch (err: any) {
    actionMsg.value = { kind: 'err', text: `이벤트 추진 실패: ${err?.message ?? 'error'}` };
  } finally {
    busyKey.value = null;
  }
}

async function applyInventory(p: CampusPlay): Promise<void> {
  if (!canWrite.value) return;
  const adjustments = changedTargets(p);
  if (adjustments.length === 0) {
    actionMsg.value = { kind: 'err', text: '변경된 재고 수량이 없습니다.' };
    return;
  }
  busyKey.value = `inv:${p.eventId}`;
  actionMsg.value = null;
  try {
    const res = await campusApi.adjustInventory(storeId.value, {
      academicEventId: p.eventId,
      reason: `${p.universityShortName ?? p.universityName} ${EVENT_LABEL[p.eventType]} 대응`,
      adjustments,
    });
    actionMsg.value = { kind: 'ok', text: `재고 수량 수정 완료 — ${res.updated}개 품목 반영` };
    await load();
  } catch (err: any) {
    actionMsg.value = { kind: 'err', text: `재고 수정 실패: ${err?.message ?? 'error'}` };
  } finally {
    busyKey.value = null;
  }
}
</script>

<template>
  <div class="campus-view">
    <header class="page-header">
      <div>
        <h2>대학 축제·시험 캘린더</h2>
        <p class="subtitle">
          점포 #{{ storeId }} · 인근 대학의 축제·시험기간·통금을 파악해 이벤트 추진과 재고 수량을 선제 조정합니다.
        </p>
      </div>
      <button class="refresh" :disabled="loading" @click="load">↻ 새로고침</button>
    </header>

    <div v-if="actionMsg" class="toast" :class="actionMsg.kind">{{ actionMsg.text }}</div>
    <div v-if="!canWrite" class="readonly-note">👁 열람 전용 계정입니다. 이벤트 추진·재고 수정은 관리자만 가능합니다.</div>

    <section v-if="summary" class="summary">
      <div class="metric"><span class="label">전국 대학</span><span class="value">{{ universities.length }}</span></div>
      <div class="metric fest"><span class="label">진행중 축제</span><span class="value">{{ summary.activeFestival }}</span></div>
      <div class="metric exam"><span class="label">진행중 시험</span><span class="value">{{ summary.activeExam }}</span></div>
      <div class="metric"><span class="label">인근 연계 대학</span><span class="value">{{ nearbyCount }}</span></div>
    </section>

    <!-- 지역·검색 필터 (시·도 → 시·군·구 2단계) -->
    <section v-if="!loading && !lastError" class="filters">
      <div class="filter-row">
        <div class="region-tabs">
          <button
            v-for="rg in regions"
            :key="rg"
            class="region-tab"
            :class="{ active: regionFilter === rg }"
            @click="regionFilter = rg"
          >
            {{ rg }}
          </button>
        </div>
        <input v-model="search" class="search" type="search" placeholder="대학명·주소 검색 (예: 공주대, 신관동)" />
      </div>
      <div v-if="districts.length" class="region-tabs district-tabs">
        <span class="district-label">{{ regionFilter }} ›</span>
        <button
          v-for="d in districts"
          :key="d"
          class="region-tab sub"
          :class="{ active: districtFilter === d }"
          @click="districtFilter = d"
        >
          {{ d }}
        </button>
      </div>
    </section>

    <div v-if="loading" class="loading">불러오는 중…</div>
    <div v-else-if="lastError" class="error">에러: {{ lastError }}</div>

    <template v-else>
      <!-- 전국 대학 현황 (인근 우선) -->
      <section class="card">
        <div class="card-header">
          <h3>🏫 전국 대학 현황</h3>
          <span class="hint">{{ filteredUniversities.length }}개 표시{{ uniOverflow > 0 ? ` (상위 ${UNI_LIMIT}개만)` : '' }} · 인근 연계 우선</span>
        </div>
        <div v-if="displayUniversities.length" class="uni-grid">
          <div v-for="u in displayUniversities" :key="u.id" class="uni-card">
            <div class="uni-top">
              <strong>{{ u.shortName ?? u.name }}</strong>
              <span class="badge" :class="u.statusLabel === '축제 진행중' ? 'b-fest' : u.statusLabel === '시험기간' ? 'b-exam' : u.statusLabel === '방학' ? 'b-vac' : 'b-idle'">
                {{ u.statusLabel }}
              </span>
            </div>
            <p class="uni-addr">📍 {{ u.address ?? u.region ?? '—' }}</p>
            <p class="uni-meta">
              <span v-if="u.distanceKm != null" class="near-tag">인근 {{ u.distanceKm }}km</span>
              <span v-else>{{ sido(u.region) }}</span>
              <template v-if="u.studentCount"> · 재학생 {{ u.studentCount.toLocaleString() }}명</template>
            </p>
            <div class="chips">
              <span v-for="e in u.events.filter((ev) => ev.status !== 'past')" :key="e.id" class="chip" :class="'c-' + e.eventType">
                {{ EVENT_ICON[e.eventType] }} {{ e.title }} · {{ dday(e.daysUntilStart) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty">검색 조건에 맞는 대학이 없습니다.</div>
        <p v-if="uniOverflow > 0" class="overflow-note">… 외 {{ uniOverflow }}개 대학 — 지역 탭이나 검색으로 좁혀보세요.</p>
      </section>

      <!-- 학사 캘린더 -->
      <section class="card">
        <div class="card-header">
          <h3>🗓️ 학사 일정 · 시험 캘린더</h3>
          <div class="scope-toggle">
            <button :class="{ active: calendarScope === 'current' }" @click="calendarScope = 'current'">진행중·예정</button>
            <button :class="{ active: calendarScope === 'all' }" @click="calendarScope = 'all'">전체(종료 포함)</button>
          </div>
        </div>
        <table v-if="displayEvents.length" class="cal-table">
          <thead>
            <tr>
              <th>대학</th><th>유형</th><th>일정</th><th>기간</th><th>D-day</th>
              <th>통금</th><th>피크 시간</th><th>유동</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in displayEvents" :key="e.id" :class="{ past: e.status === 'past' }">
              <td>{{ e.universityShortName ?? e.universityName }}</td>
              <td><span class="cat" :class="'c-' + e.eventType">{{ EVENT_ICON[e.eventType] }} {{ EVENT_LABEL[e.eventType] }}</span></td>
              <td>{{ e.title }}</td>
              <td class="muted">{{ e.startDate.slice(5) }} ~ {{ e.endDate.slice(5) }}</td>
              <td>{{ e.status === 'past' ? '종료' : dday(e.daysUntilStart) }}</td>
              <td :class="{ 'curfew-lift': e.eventType === 'exam' }">{{ curfewText(e) }}</td>
              <td class="muted">{{ e.peakHours ?? '—' }}</td>
              <td><span class="traffic" :data-lv="e.trafficLevel">{{ e.trafficLevel }}</span></td>
              <td>
                <span class="status" :class="'s-' + e.status">
                  {{ e.status === 'active' ? '진행중' : e.status === 'upcoming' ? '예정' : '종료' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">조건에 맞는 학사 일정이 없습니다.</div>
        <p v-if="eventOverflow > 0" class="overflow-note">… 외 {{ eventOverflow }}건 — 지역·검색으로 좁혀보세요.</p>
      </section>

      <!-- AI 추천: 이벤트 추진 · 재고 조정 -->
      <section class="card">
        <div class="card-header">
          <h3>🤖 AI 운영 추천 — 이벤트 추진 · 재고 수량 조정</h3>
          <span class="hint">진행중·7일 이내 임박 일정 기준</span>
        </div>

        <div class="reco-scope">
          <span class="scope-badge" :class="recoScope === 'filtered' ? 'filtered' : 'nearby'">
            {{ recoScope === 'filtered' ? '📍 지역 선택' : '🏪 인근 연계' }}
          </span>
          <span class="scope-text">현재 추천 기준: <strong>{{ recoScopeLabel }}</strong></span>
          <span v-if="recoLoading" class="scope-loading">· 갱신 중…</span>
          <span v-else-if="recoScope === 'filtered'" class="scope-hint">· 위 지역 필터를 바꾸면 해당 지역 대학 기준으로 자동 전환됩니다</span>
        </div>

        <div v-if="recoLoading && !plays.length" class="empty">지역 추천 불러오는 중…</div>
        <div v-else-if="!plays.length" class="empty">
          {{ recoScope === 'filtered'
            ? '선택한 지역에 진행중·임박(7일 이내) 학사 일정이 없습니다. 다른 지역·대학을 선택해 보세요.'
            : '현재 추천할 진행중·임박 일정이 없습니다.' }}
        </div>

        <div v-for="p in plays" :key="p.eventId" class="play">
          <div class="play-head">
            <div class="play-title">
              <span class="cat" :class="'c-' + p.eventType">{{ EVENT_ICON[p.eventType] }} {{ EVENT_LABEL[p.eventType] }}</span>
              <strong>{{ p.universityShortName ?? p.universityName }} · {{ p.title }}</strong>
              <span class="status" :class="'s-' + p.status">{{ p.status === 'active' ? '진행중' : dday(p.daysUntilStart) }}</span>
            </div>
            <div class="play-meta">
              <span>🌙 통금 {{ curfewText(p) }}</span>
              <span>⏰ 피크 {{ p.peakHours ?? '—' }}</span>
              <span>📈 유동 {{ p.trafficLevel }}</span>
            </div>
          </div>
          <p class="headline">{{ p.headline }}</p>

          <!-- 이벤트(프로모션) 추진 — 상세 추진안 -->
          <div v-if="p.promotion" class="promo">
            <div class="promo-top">
              <div class="promo-headline">
                <span class="promo-tag">프로모션 제안</span>
                <strong>{{ p.promotion.label }}</strong>
                <span class="promo-disc">-{{ p.promotion.discountPct }}%</span>
                <span class="promo-uplift">기대 매출 +{{ p.promotion.expectedUpliftPct }}%</span>
              </div>
              <button
                class="btn primary"
                :disabled="!canWrite || busyKey === `promo:${p.eventId}`"
                @click="promote(p)"
              >
                {{ busyKey === `promo:${p.eventId}` ? '추진 중…' : '이벤트 추진' }}
              </button>
            </div>

            <p class="promo-mechanic">💡 {{ p.promotion.mechanic }}</p>
            <p v-if="p.promotion.discountNote" class="promo-note">↳ {{ p.promotion.discountNote }}</p>

            <div class="promo-grid">
              <div class="promo-field">
                <span class="pf-label">🎯 핵심 타깃</span>
                <div class="pf-tags">
                  <span v-for="t in p.promotion.targetItems" :key="t" class="pf-tag">{{ t }}</span>
                </div>
              </div>
              <div class="promo-field">
                <span class="pf-label">📦 추천 묶음 구성</span>
                <div class="pf-tags">
                  <span v-for="b in p.promotion.bundles" :key="b" class="pf-tag bundle">{{ b }}</span>
                </div>
              </div>
              <div class="promo-field">
                <span class="pf-label">📣 노출 채널</span>
                <div class="pf-tags">
                  <span v-for="c in p.promotion.channels" :key="c" class="pf-tag channel">{{ c }}</span>
                </div>
              </div>
              <div class="promo-field">
                <span class="pf-label">🗂 대상 카테고리</span>
                <div class="pf-tags">
                  <span v-for="c in p.promotion.categories" :key="c" class="pf-tag">{{ c }}</span>
                </div>
              </div>
            </div>

            <div class="promo-foot">
              <span>🗓 기간 {{ p.promotion.period }}</span>
              <span>⏰ 적용 시간대 {{ p.promotion.window }}</span>
            </div>
            <p class="promo-tip">📌 {{ p.promotion.tip }}</p>
          </div>

          <!-- 재고 수량 조정 -->
          <div class="inv-block">
            <div class="inv-head">
              <span class="inv-title">권장 재고 조정 ({{ p.inventoryTargets.length }}개 품목)</span>
              <div class="inv-actions">
                <button class="btn ghost" @click="resetToSuggested(p)">추천값 채우기</button>
                <button
                  class="btn primary"
                  :disabled="!canWrite || busyKey === `inv:${p.eventId}`"
                  @click="applyInventory(p)"
                >
                  {{ busyKey === `inv:${p.eventId}` ? '적용 중…' : '재고 수량 수정 적용' }}
                </button>
              </div>
            </div>
            <div class="inv-scroll">
              <table class="inv-table">
                <thead>
                  <tr><th>상품</th><th>카테고리</th><th>현재고</th><th>권장</th><th>조정 수량</th></tr>
                </thead>
                <tbody>
                  <tr v-for="t in p.inventoryTargets" :key="t.inventoryId">
                    <td>{{ t.productName }}</td>
                    <td><span class="cat">{{ t.category }}</span></td>
                    <td class="num">{{ t.currentQty }}</td>
                    <td class="num">
                      <span :class="t.deltaQty > 0 ? 'up' : t.deltaQty < 0 ? 'down' : ''">
                        {{ t.suggestedQty }}<small v-if="t.deltaQty"> ({{ t.deltaQty > 0 ? '+' : '' }}{{ t.deltaQty }})</small>
                      </span>
                    </td>
                    <td class="num">
                      <input
                        v-model.number="editQty[qKey(p.eventId, t.inventoryId)]"
                        type="number"
                        min="0"
                        :disabled="!canWrite"
                        class="qty-input"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.campus-view { display: flex; flex-direction: column; gap: 1.25rem; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.subtitle { margin: 0.3rem 0 0; color: #64748d; font-size: 0.9rem; max-width: 60ch; }
.refresh { border: 1px solid #c7d2e0; background: #fff; border-radius: 6px; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem; }
.refresh:hover { background: #eef3f8; }

.toast { padding: 0.7rem 1rem; border-radius: 8px; font-size: 0.9rem; }
.toast.ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.toast.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.readonly-note { background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; padding: 0.55rem 0.9rem; border-radius: 8px; font-size: 0.85rem; }

.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
.metric { background: #fff; padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.metric .label { font-size: 0.78rem; color: #64748d; }
.metric .value { font-size: 1.4rem; font-weight: 700; color: #0d253d; }
.metric.fest { background: #fdf2f8; } .metric.fest .value { color: #be185d; }
.metric.exam { background: #eff6ff; } .metric.exam .value { color: #1d4ed8; }

.card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
h3 { margin: 0; font-size: 1.05rem; }
.hint, .muted { color: #8a99af; font-size: 0.82rem; }

/* 지역·검색 필터 (2단계) */
.filters { display: flex; flex-direction: column; gap: 0.55rem; }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.region-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
.region-tab { border: 1px solid #d7def0; background: #fff; color: #475569; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.8rem; cursor: pointer; }
.region-tab:hover { background: #eef3f8; }
.region-tab.active { background: #533afd; border-color: #533afd; color: #fff; font-weight: 600; }
.search { flex: 1; min-width: 200px; max-width: 320px; border: 1px solid #c7d2e0; border-radius: 8px; padding: 0.45rem 0.7rem; font-size: 0.88rem; }
.district-tabs { padding: 0.5rem 0.6rem; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 10px; }
.district-label { font-size: 0.78rem; font-weight: 700; color: #4434d4; margin-right: 0.15rem; }
.region-tab.sub { font-size: 0.78rem; padding: 0.2rem 0.6rem; }
.region-tab.sub.active { background: #4434d4; border-color: #4434d4; }
.overflow-note { margin: 0.75rem 0 0; color: #8a99af; font-size: 0.82rem; text-align: center; }
.scope-toggle { display: flex; gap: 0.25rem; background: #f1f5f9; border-radius: 8px; padding: 0.15rem; }
.scope-toggle button { border: none; background: transparent; color: #64748b; border-radius: 6px; padding: 0.3rem 0.7rem; font-size: 0.8rem; cursor: pointer; }
.scope-toggle button.active { background: #fff; color: #4434d4; font-weight: 600; box-shadow: 0 1px 2px rgba(15,23,42,0.08); }

.uni-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.8rem; }
.uni-card { border: 1px solid #eef3f8; border-radius: 8px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.4rem; }
.uni-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.uni-addr { margin: 0; color: #475569; font-size: 0.78rem; }
.uni-meta { margin: 0; color: #64748d; font-size: 0.78rem; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
.near-tag { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 999px; padding: 0.05rem 0.45rem; font-size: 0.72rem; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip { font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 999px; background: #eef3f8; color: #3f5069; }
.chip.c-festival { background: #fce7f3; color: #be185d; }
.chip.c-exam { background: #dbeafe; color: #1d4ed8; }
.chip.c-vacation { background: #f0fdf4; color: #15803d; }

.badge { font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 999px; font-weight: 600; }
.b-fest { background: #fce7f3; color: #be185d; }
.b-exam { background: #dbeafe; color: #1d4ed8; }
.b-vac { background: #dcfce7; color: #15803d; }
.b-idle { background: #eef3f8; color: #64748d; }

.cal-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.cal-table th, .cal-table td { padding: 0.5rem 0.5rem; text-align: left; border-bottom: 1px solid #eef3f8; }
.cal-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; }
.cal-table tr.past { opacity: 0.5; }
.curfew-none { color: #b45309; }
.curfew-lift { color: #15803d; font-weight: 600; white-space: nowrap; }

.cat { padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.76rem; background: #eef3f8; color: #3f5069; white-space: nowrap; }
.cat.c-festival { background: #fce7f3; color: #be185d; }
.cat.c-exam { background: #dbeafe; color: #1d4ed8; }
.cat.c-vacation { background: #dcfce7; color: #15803d; }

.traffic { padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.74rem; text-transform: uppercase; }
.traffic[data-lv="peak"] { background: #fee2e2; color: #b91c1c; }
.traffic[data-lv="high"] { background: #ffedd5; color: #c2410c; }
.traffic[data-lv="normal"] { background: #eef3f8; color: #3f5069; }
.traffic[data-lv="low"] { background: #f1f5f9; color: #64748b; }

.status { font-size: 0.74rem; padding: 0.1rem 0.5rem; border-radius: 999px; font-weight: 600; }
.s-active { background: #dcfce7; color: #15803d; }
.s-upcoming { background: #fef9c3; color: #a16207; }
.s-past { background: #f1f5f9; color: #94a3b8; }

.reco-scope { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.9rem;
  background: #f8fafc; border: 1px solid #eef3f8; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.84rem; color: #475569; }
.scope-badge { font-size: 0.74rem; font-weight: 700; padding: 0.12rem 0.55rem; border-radius: 999px; }
.scope-badge.nearby { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.scope-badge.filtered { background: #eef2ff; color: #4434d4; border: 1px solid #c7d2fe; }
.scope-text strong { color: #0d253d; }
.scope-loading { color: #4434d4; font-weight: 600; }
.scope-hint { color: #8a99af; font-size: 0.8rem; }

.play { border: 1px solid #e7edf4; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
.play:last-child { margin-bottom: 0; }
.play-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.play-title { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.play-meta { display: flex; gap: 0.85rem; color: #475569; font-size: 0.82rem; flex-wrap: wrap; }
.headline { margin: 0.55rem 0 0.85rem; color: #334155; font-size: 0.9rem; }

.promo { display: flex; flex-direction: column; gap: 0.55rem;
  background: linear-gradient(135deg, #faf5ff, #fdf2f8); border: 1px solid #f0e6fb; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 0.85rem; }
.promo-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.promo-headline { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; font-size: 0.92rem; color: #334155; }
.promo-headline strong { font-size: 0.98rem; }
.promo-tag { background: #ede9fe; color: #6d28d9; font-size: 0.72rem; font-weight: 600; padding: 0.12rem 0.5rem; border-radius: 999px; }
.promo-disc { color: #be185d; font-weight: 700; }
.promo-uplift { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-size: 0.74rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 999px; }
.promo-mechanic { margin: 0; font-size: 0.88rem; color: #4434d4; font-weight: 600; }
.promo-note { margin: 0; font-size: 0.78rem; color: #8a7bd8; }
.promo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.55rem 0.9rem; margin-top: 0.15rem; }
.promo-field { display: flex; flex-direction: column; gap: 0.3rem; }
.pf-label { font-size: 0.76rem; font-weight: 700; color: #6d28d9; }
.pf-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.pf-tag { background: #fff; border: 1px solid #e9d8fb; color: #5b3fb0; font-size: 0.76rem; padding: 0.12rem 0.5rem; border-radius: 6px; }
.pf-tag.bundle { background: #fdf2f8; border-color: #fbcfe8; color: #be185d; }
.pf-tag.channel { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.promo-foot { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.8rem; color: #64748b; border-top: 1px dashed #f0e6fb; padding-top: 0.5rem; }
.promo-tip { margin: 0; font-size: 0.82rem; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 0.45rem 0.6rem; }

.inv-block { border-top: 1px dashed #e7edf4; padding-top: 0.75rem; }
.inv-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.inv-title { font-size: 0.86rem; font-weight: 600; color: #334155; }
.inv-actions { display: flex; gap: 0.5rem; }
.inv-scroll { max-height: 280px; overflow: auto; border: 1px solid #eef3f8; border-radius: 6px; }
.inv-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.inv-table th, .inv-table td { padding: 0.4rem 0.55rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.inv-table th { background: #f6f9fc; color: #3f5069; font-weight: 600; position: sticky; top: 0; }
.inv-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.inv-table .up { color: #15803d; font-weight: 600; }
.inv-table .down { color: #b91c1c; font-weight: 600; }
.qty-input { width: 70px; padding: 0.25rem 0.4rem; border: 1px solid #c7d2e0; border-radius: 4px; text-align: right; }

.btn { border: none; border-radius: 6px; padding: 0.45rem 0.85rem; font-size: 0.85rem; cursor: pointer; font-weight: 600; }
.btn.primary { background: #533afd; color: #fff; }
.btn.primary:hover { background: #4434d4; }
.btn.primary:disabled { background: #c7c2f5; cursor: not-allowed; }
.btn.ghost { background: #fff; border: 1px solid #c7d2e0; color: #475569; }
.btn.ghost:hover { background: #eef3f8; }

.loading, .empty { padding: 1.5rem; text-align: center; color: #8a99af; }
.error { padding: 1rem; color: #b91c1c; }

@media (max-width: 768px) {
  .summary { grid-template-columns: repeat(2, 1fr); }
  .cal-table { font-size: 0.8rem; }
  .cal-table th:nth-child(7), .cal-table td:nth-child(7) { display: none; }
}
</style>
