/**
 * T023 — Baseline 수요 예측 어댑터 (skeleton)
 *   실제 알고리즘은 T029(forecast 서비스, 이동평균 + 요일/날씨 가중)에서 보강.
 *   여기서는 팩토리가 로드 가능한 최소 구현만 둔다.
 */
import type { ForecastAdapter, ForecastInput, ForecastResult } from '../../ports/forecast';

const adapter: ForecastAdapter = {
  name: 'baseline',
  async predict(input: ForecastInput): Promise<ForecastResult> {
    return {
      storeId: input.storeId,
      productMasterId: input.productMasterId,
      targetDate: input.targetDate,
      predictedQuantity: 10, // TODO(T029) — 실 데이터 기반 산출
      confidence: 0.5,
      modelVersion: 'baseline-v0-skeleton',
    };
  },
  async predictBatch(inputs: ForecastInput[]): Promise<ForecastResult[]> {
    return Promise.all(inputs.map((i) => this.predict(i)));
  },
};

export default adapter;
