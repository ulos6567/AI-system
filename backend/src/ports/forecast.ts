/**
 * T022 — 수요 예측 어댑터 포트
 *   기본: 통계 베이스라인(이동평균 + 요일/날씨 가중)
 *   후속: Python 추론 서비스 분리 가능 (R-001)
 */

export interface ForecastInput {
  storeId: number;
  productMasterId: number;
  targetDate: Date;
  // 옵션: 외부 신호 컨텍스트 (날씨·이벤트 등) — 어댑터별로 활용 여부 결정
  context?: Record<string, unknown>;
}

export interface ForecastResult {
  storeId: number;
  productMasterId: number;
  targetDate: Date;
  predictedQuantity: number;
  confidence: number; // 0.0 ~ 1.0
  modelVersion: string;
}

export interface ForecastAdapter {
  readonly name: string;
  predict(input: ForecastInput): Promise<ForecastResult>;
  predictBatch(inputs: ForecastInput[]): Promise<ForecastResult[]>;
}
