/** T022 — Vision/AI 카메라 어댑터 (1차 모의 — analytics_customer_behavior 적재) */

export interface VisionEvent {
  storeId: number;
  anonSessionId: string; // UUID, 익명
  eventType: 'dwell' | 'path' | 'pickup' | 'approach_shelf' | 'exit';
  zoneCode?: string;
  productMasterId?: number;
  dwellSeconds?: number;
  occurredAt: Date;
}

export interface VisionAdapter {
  readonly name: string;
  /** 사전녹화 데이터셋 재생 (mock) 또는 실시간 추론 결과 구독 (real) */
  startCapture(storeId: number, onEvent: (ev: VisionEvent) => Promise<void>): Promise<void>;
  stopCapture(storeId: number): Promise<void>;
}
