/**
 * 002 (T030) — 외부 LLM HTTP 어댑터 (OpenAI 호환 chat/completions)
 *   - 키/엔드포인트/모델은 .env 의 LLM_API_KEY / LLM_API_BASE / LLM_MODEL 사용(평문 커밋 금지).
 *   - groundingContext 는 system 프롬프트로 합성되며, 비식별 집계 데이터만 전달된다(개인식별자 미포함).
 */
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResult } from '../../ports/llm';
import { config } from '../../config';
import { logger } from '../../lib/logger';

const SYSTEM_BASE =
  '당신은 소매 점포 운영을 돕는 한국어 AI 비서입니다. ' +
  '반드시 제공된 [운영 데이터]에만 근거해 답하세요. ' +
  '데이터에 없는 내용은 추측하지 말고 "데이터 없음"이라고 답하세요. ' +
  '개인 식별 정보는 다루지 않습니다.';

const adapter: LlmAdapter = {
  name: 'llm-http',
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!config.llm.apiKey || !config.llm.apiBase || !config.llm.model) {
      throw new Error('[llm-http] LLM_API_KEY / LLM_API_BASE / LLM_MODEL 미설정');
    }
    const system =
      SYSTEM_BASE + (req.groundingContext ? `\n\n[운영 데이터]\n${req.groundingContext}` : '');
    const messages = [{ role: 'system' as const, content: system }, ...req.messages];

    const url = `${config.llm.apiBase.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        max_tokens: req.maxTokens ?? 512,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, text: text.slice(0, 200) }, 'llm-http call failed');
      throw new Error(`[llm-http] upstream ${res.status}`);
    }
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    return { content, model: data?.model ?? config.llm.model };
  },
};

export default adapter;
