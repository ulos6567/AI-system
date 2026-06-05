/**
 * 002 (T030) — LLM 모의 어댑터
 *   외부 키 없이 결정적으로 동작. groundingContext 가 있으면 그 데이터를 근거로 한
 *   요약 답변을, 없으면 "데이터 없음" 폴백을 반환한다(환각 방지, SC-010).
 *   실제 전환 시 ADAPTER_LLM=openai 로 http 어댑터를 사용한다.
 */
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResult } from '../../ports/llm';

const adapter: LlmAdapter = {
  name: 'llm-mock',
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const ctx = (req.groundingContext ?? '').trim();
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (!ctx) {
      return {
        content: '관련 운영 데이터를 찾지 못했어요. 질문을 더 구체적으로 해주시거나, 데이터가 충분히 쌓인 뒤 다시 시도해 주세요. (데이터 없음)',
        model: 'mock',
      };
    }
    return {
      content: `질문하신 "${lastUser}"에 대해 아래 운영 데이터를 근거로 답변드립니다.\n\n${ctx}`,
      model: 'mock',
    };
  },
};

export default adapter;
