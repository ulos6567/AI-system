<script setup lang="ts">
/**
 * 002 (T034) — AI 도우미 챗 화면 (FR-019~021, SC-010)
 *   자연어 질의 → 근거(sources) 동반 응답. 근거 없으면 "데이터 없음" 안내.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAssistantStore } from '@/stores/assistant';

const auth = useAuthStore();
const assistant = useAssistantStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

const input = ref('');
const scroller = ref<HTMLElement | null>(null);

const suggestions = [
  '오늘 최다 판매 상품은?',
  '내일 도시락 발주량 알려줘',
  '이번 달 마진은 얼마야?',
  '최근 일주일 폐기 얼마나 났어?',
];

const SOURCE_LABEL: Record<string, string> = {
  transaction: '거래 데이터',
  demand_forecast: '수요예측',
  inventory_history: '재고 이력',
};
function sourceText(s: { type: string; period?: string; detail?: string }): string {
  return `${SOURCE_LABEL[s.type] ?? s.type}${s.detail ? ` · ${s.detail}` : ''}`;
}

async function submit(text?: string): Promise<void> {
  const msg = (text ?? input.value).trim();
  if (!msg || assistant.sending) return;
  input.value = '';
  await assistant.send(storeId.value, msg);
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' });
}

watch(() => assistant.messages.length, async () => {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
});
</script>

<template>
  <div class="assistant-view">
    <header class="page-header">
      <div>
        <h2>AI 점포 매니저 어시스턴트</h2>
        <p class="subtitle">점포 #{{ storeId }} · 운영 데이터를 근거로 답변합니다.</p>
      </div>
      <button class="ghost" @click="assistant.reset()">새 대화</button>
    </header>

    <div class="chat" ref="scroller">
      <div v-if="assistant.messages.length === 0" class="welcome">
        <p class="welcome-title">무엇이 궁금하세요?</p>
        <div class="suggestions">
          <button v-for="s in suggestions" :key="s" class="sug" @click="submit(s)">{{ s }}</button>
        </div>
      </div>

      <div v-for="m in assistant.messages" :key="m.id" class="msg" :class="m.role">
        <div class="bubble">
          <p class="content">{{ m.content }}</p>
          <div v-if="m.role === 'assistant' && m.facts && m.facts.length" class="facts">
            <div class="facts-head">📊 근거 데이터</div>
            <ul class="facts-list">
              <li v-for="(f, i) in m.facts" :key="i" :class="{ sub: f.startsWith('  ') }">{{ f.trim() }}</li>
            </ul>
          </div>
          <div v-if="m.role === 'assistant' && m.sources && m.sources.length" class="sources">
            <span class="src-label">📎 출처</span>
            <span v-for="(s, i) in m.sources" :key="i" class="src-chip">{{ sourceText(s) }}</span>
          </div>
          <div v-else-if="m.role === 'assistant' && !m.hadGrounding" class="no-ground">근거 데이터 없음</div>
        </div>
      </div>

      <div v-if="assistant.sending" class="msg assistant">
        <div class="bubble typing">답변 작성 중…</div>
      </div>
    </div>

    <p v-if="assistant.lastError" class="error">{{ assistant.lastError }}</p>

    <form class="composer" @submit.prevent="submit()">
      <input v-model="input" type="text" placeholder="질문을 입력하세요 (예: 오늘 매출 어때?)" :disabled="assistant.sending" />
      <button type="submit" class="primary" :disabled="assistant.sending || !input.trim()">전송</button>
    </form>
  </div>
</template>

<style scoped>
.assistant-view { display: flex; flex-direction: column; gap: 0.75rem; height: calc(100vh - 8rem); }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
.subtitle { color: #64748d; font-size: 0.9rem; margin: 0.2rem 0 0; max-width: 48rem; }
.chat { flex: 1; overflow-y: auto; background: #fff; border: 1px solid #e3e8ee; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.welcome { margin: auto; text-align: center; color: #64748d; }
.welcome-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: #273951; }
.suggestions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; max-width: 32rem; }
.sug { background: #eef3f8; border: 1px solid #e3e8ee; border-radius: 999px; padding: 0.4rem 0.9rem; cursor: pointer; font-size: 0.85rem; }
.sug:hover { background: #ecebfe; }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.bubble { max-width: 80%; padding: 0.7rem 0.95rem; border-radius: 12px; line-height: 1.5; }
.msg.user .bubble { background: #533afd; color: #fff; border-bottom-right-radius: 4px; }
.msg.assistant .bubble { background: #eef3f8; color: #0d253d; border-bottom-left-radius: 4px; }
.content { margin: 0; white-space: pre-wrap; }
.facts { margin-top: 0.55rem; background: #fff; border: 1px solid #dfe6ef; border-radius: 8px; padding: 0.5rem 0.7rem; }
.facts-head { font-size: 0.72rem; font-weight: 700; color: #4434d4; margin-bottom: 0.3rem; }
.facts-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.15rem; }
.facts-list li { font-size: 0.8rem; color: #273951; line-height: 1.45; }
.facts-list li.sub { padding-left: 0.8rem; color: #5a6b82; position: relative; }
.facts-list li.sub::before { content: '·'; position: absolute; left: 0.25rem; color: #9aa7ba; }
.sources { margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
.src-label { font-size: 0.72rem; color: #3f5069; font-weight: 600; }
.src-chip { font-size: 0.72rem; background: #e7e6fe; color: #2e2b8c; padding: 0.1rem 0.45rem; border-radius: 999px; }
.no-ground { margin-top: 0.4rem; font-size: 0.75rem; color: #b45309; }
.typing { color: #8a99af; font-style: italic; }
.composer { display: flex; gap: 0.5rem; }
.composer input { flex: 1; padding: 0.65rem 0.9rem; border: 1px solid #cdd7e3; border-radius: 8px; font-size: 0.95rem; }
button { cursor: pointer; border-radius: 8px; padding: 0.5rem 1.1rem; border: 1px solid transparent; }
button.primary { background: #533afd; color: #fff; }
button.primary:disabled { background: #b9b9f9; cursor: not-allowed; }
button.ghost { background: #fff; border-color: #cdd7e3; }
.error { color: #dc2626; }
</style>
