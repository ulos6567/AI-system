import { defineStore } from 'pinia';
import { ref } from 'vue';
import { assistantApi, type AssistantMessage } from '@/api/assistant';

export const useAssistantStore = defineStore('assistant', () => {
  const messages = ref<AssistantMessage[]>([]);
  const conversationId = ref<number | null>(null);
  const sending = ref(false);
  const lastError = ref<string | null>(null);

  async function send(storeId: number, message: string): Promise<void> {
    sending.value = true;
    lastError.value = null;
    // 사용자 메시지를 낙관적으로 추가
    messages.value = [
      ...messages.value,
      {
        id: Date.now(),
        role: 'user',
        content: message,
        sources: null,
        hadGrounding: false,
        linkedActionId: null,
        createdAt: new Date().toISOString(),
      },
    ];
    try {
      const ans = await assistantApi.ask(storeId, message, conversationId.value ?? undefined);
      conversationId.value = ans.conversationId;
      messages.value = [
        ...messages.value,
        {
          id: ans.messageId,
          role: 'assistant',
          content: ans.content,
          sources: ans.sources,
          hadGrounding: ans.hadGrounding,
          linkedActionId: null,
          createdAt: new Date().toISOString(),
        },
      ];
    } catch (err: any) {
      lastError.value = err?.message ?? 'failed';
    } finally {
      sending.value = false;
    }
  }

  function reset(): void {
    messages.value = [];
    conversationId.value = null;
    lastError.value = null;
  }

  return { messages, conversationId, sending, lastError, send, reset };
});
