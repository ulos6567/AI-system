/** 002 (T006) — LLM 포트 (AI 경영비서, 실제 외부 LLM 연동 대상) */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  /** RAG 근거 컨텍스트(비식별). 어댑터가 system 프롬프트로 합성. */
  groundingContext?: string;
  maxTokens?: number;
}

export interface LlmCompletionResult {
  content: string;
  model: string;
}

export interface LlmAdapter {
  readonly name: string;
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
