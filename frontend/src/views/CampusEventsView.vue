<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
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

async function load(): Promise<void> {
  loading.value = true;
  lastError.value = null;
  try {
    const [u, c, r] = await Promise.all([
      campusApi.universities(storeId.value),
      campusApi.calendar(storeId.value),
      campusApi.recommendations(storeId.value),
    ]);
    universities.value = u.universities;
    events.value = c.events;
    summary.value = c.summary;
    plays.value = r.plays;
    // 편집 버퍼를 추천 수량으로 초기화
    for (const key of Object.keys(editQty)) delete editQty[key];
    for (const p of plays.value) {
      for (const t of p.inventoryTargets) {
        editQty[qKey(p.eventId, t.inventoryId)] = t.suggestedQty;
      }
    }
  } catch (err: any) {
    lastError.value = err?.message ?? 'failed';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function dday(daysUntilStart: number): string {
  if (daysUntilStart <= 0) return '진행중';
  return `D-${daysUntilStart}`;
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
      <div class="metric"><span class="label">인근 대학</span><span class="value">{{ universities.length }}</span></div>
      <div class="metric fest"><span class="label">진행중 축제</span><span class="value">{{ summary.activeFestival }}</span></div>
      <div class="metric exam"><span class="label">진행중 시험</span><span class="value">{{ summary.activeExam }}</span></div>
      <div class="metric"><span class="label">임박 일정</span><span class="value">{{ summary.upcoming }}</span></div>
    </section>

    <div v-if="loading" class="loading">불러오는 중…</div>
    <div v-else-if="lastError" class="error">에러: {{ lastError }}</div>

    <template v-else>
      <!-- 인근 대학 현황 -->
      <section class="card">
        <div class="card-header"><h3>🏫 인근 대학 현황</h3></div>
        <div v-if="universities.length" class="uni-grid">
          <div v-for="u in universities" :key="u.id" class="uni-card">
            <div class="uni-top">
              <strong>{{ u.shortName ?? u.name }}</strong>
              <span class="badge" :class="u.statusLabel === '축제 진행중' ? 'b-fest' : u.statusLabel === '시험기간' ? 'b-exam' : u.statusLabel === '방학' ? 'b-vac' : 'b-idle'">
                {{ u.statusLabel }}
              </span>
            </div>
            <p class="uni-meta">
              {{ u.region ?? '—' }} · {{ u.distanceKm != null ? u.distanceKm + 'km' : '—' }}
              <template v-if="u.studentCount"> · 재학생 {{ u.studentCount.toLocaleString() }}명</template>
            </p>
            <div class="chips">
              <span v-for="e in u.events.filter((ev) => ev.status !== 'past')" :key="e.id" class="chip" :class="'c-' + e.eventType">
                {{ EVENT_ICON[e.eventType] }} {{ e.title }} · {{ dday(e.daysUntilStart) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty">이 점포에 연계된 대학이 없습니다.</div>
      </section>

      <!-- 학사 캘린더 -->
      <section class="card">
        <div class="card-header"><h3>🗓️ 학사 일정 · 통금 시간</h3></div>
        <table v-if="events.length" class="cal-table">
          <thead>
            <tr>
              <th>대학</th><th>유형</th><th>일정</th><th>기간</th><th>D-day</th>
              <th>통금</th><th>피크 시간</th><th>유동</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in events" :key="e.id" :class="{ past: e.status === 'past' }">
              <td>{{ e.universityShortName ?? e.universityName }}</td>
              <td><span class="cat" :class="'c-' + e.eventType">{{ EVENT_ICON[e.eventType] }} {{ EVENT_LABEL[e.eventType] }}</span></td>
              <td>{{ e.title }}</td>
              <td class="muted">{{ e.startDate.slice(5) }} ~ {{ e.endDate.slice(5) }}</td>
              <td>{{ e.status === 'past' ? '종료' : dday(e.daysUntilStart) }}</td>
              <td :class="{ 'curfew-none': !e.curfewTime }">{{ e.curfewTime ?? '없음' }}</td>
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
        <div v-else class="empty">학사 일정이 없습니다.</div>
      </section>

      <!-- AI 추천: 이벤트 추진 · 재고 조정 -->
      <section class="card">
        <div class="card-header">
          <h3>🤖 AI 운영 추천 — 이벤트 추진 · 재고 수량 조정</h3>
          <span class="hint">진행중·7일 이내 임박 일정 기준</span>
        </div>

        <div v-if="!plays.length" class="empty">현재 추천할 진행중·임박 일정이 없습니다.</div>

        <div v-for="p in plays" :key="p.eventId" class="play">
          <div class="play-head">
            <div class="play-title">
              <span class="cat" :class="'c-' + p.eventType">{{ EVENT_ICON[p.eventType] }} {{ EVENT_LABEL[p.eventType] }}</span>
              <strong>{{ p.universityShortName ?? p.universityName }} · {{ p.title }}</strong>
              <span class="status" :class="'s-' + p.status">{{ p.status === 'active' ? '진행중' : dday(p.daysUntilStart) }}</span>
            </div>
            <div class="play-meta">
              <span>🌙 통금 {{ p.curfewTime ?? '없음' }}</span>
              <span>⏰ 피크 {{ p.peakHours ?? '—' }}</span>
              <span>📈 유동 {{ p.trafficLevel }}</span>
            </div>
          </div>
          <p class="headline">{{ p.headline }}</p>

          <!-- 이벤트(프로모션) 추진 -->
          <div v-if="p.promotion" class="promo">
            <div class="promo-info">
              <span class="promo-tag">프로모션 제안</span>
              <strong>{{ p.promotion.label }}</strong>
              <span class="promo-disc">-{{ p.promotion.discountPct }}%</span>
              <span class="promo-cats">대상: {{ p.promotion.categories.join(', ') }}</span>
              <span class="promo-win">적용 시간대: {{ p.promotion.window }}</span>
            </div>
            <button
              class="btn primary"
              :disabled="!canWrite || busyKey === `promo:${p.eventId}`"
              @click="promote(p)"
            >
              {{ busyKey === `promo:${p.eventId}` ? '추진 중…' : '이벤트 추진' }}
            </button>
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

.uni-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.8rem; }
.uni-card { border: 1px solid #eef3f8; border-radius: 8px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.45rem; }
.uni-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.uni-meta { margin: 0; color: #64748d; font-size: 0.78rem; }
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

.play { border: 1px solid #e7edf4; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
.play:last-child { margin-bottom: 0; }
.play-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.play-title { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.play-meta { display: flex; gap: 0.85rem; color: #475569; font-size: 0.82rem; flex-wrap: wrap; }
.headline { margin: 0.55rem 0 0.85rem; color: #334155; font-size: 0.9rem; }

.promo { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;
  background: linear-gradient(90deg, #faf5ff, #fdf2f8); border: 1px solid #f0e6fb; border-radius: 8px; padding: 0.7rem 0.9rem; margin-bottom: 0.85rem; }
.promo-info { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; font-size: 0.86rem; color: #475569; }
.promo-tag { background: #ede9fe; color: #6d28d9; font-size: 0.72rem; font-weight: 600; padding: 0.12rem 0.5rem; border-radius: 999px; }
.promo-disc { color: #be185d; font-weight: 700; }
.promo-cats, .promo-win { color: #64748b; font-size: 0.8rem; }

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
