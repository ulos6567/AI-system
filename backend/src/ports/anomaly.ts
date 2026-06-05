/** 002 (T006) — 이상 징후 감지 입력 포트 (1차 시뮬레이션) */

export type AnomalyType = 'unpaid_exit' | 'disturbance' | 'collapse' | 'intrusion';

export interface AnomalySignal {
  storeId: number;
  anomalyType: AnomalyType;
  severity: number; // 1~5
  zoneCode?: string;
  snapshotRef?: string;
  detectedAt: Date;
}

export interface AnomalyAdapter {
  readonly name: string;
  /** 이상 이벤트 스트림 구독 (sim: 시뮬레이션 생성, real: 실시간 영상 분석 결과) */
  subscribe(storeId: number, onEvent: (ev: AnomalySignal) => Promise<void>): Promise<void>;
  unsubscribe(storeId: number): Promise<void>;
}
