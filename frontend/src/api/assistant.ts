import { api } from './client';

export interface GroundingSource {
  type: string;
  period?: string;
  detail?: string;
}

export interface AssistantAnswer {
  conversationId: number;
  messageId: number;
  content: string;
  sources: GroundingSource[];
  hadGrounding: boolean;
  model: string;
}

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources: GroundingSource[] | null;
  hadGrounding: boolean;
  linkedActionId: number | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  startedAt: string;
  firstQuery: string | null;
  messageCount: number;
}

export const assistantApi = {
  conversations: (storeId: number) =>
    api<{ storeId: number; conversations: ConversationSummary[] }>(`/stores/${storeId}/assistant/conversations`),
  messages: (storeId: number, id: number) =>
    api<{ conversationId: number; messages: AssistantMessage[] }>(
      `/stores/${storeId}/assistant/conversations/${id}/messages`,
    ),
  ask: (storeId: number, message: string, conversationId?: number) =>
    conversationId
      ? api<AssistantAnswer>(`/stores/${storeId}/assistant/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message }),
        })
      : api<AssistantAnswer>(`/stores/${storeId}/assistant/ask`, {
          method: 'POST',
          body: JSON.stringify({ message }),
        }),
};
