/** T022 — 외부 신호 어댑터 (날씨/유동인구/이벤트) */

export type SignalType = 'weather' | 'foot_traffic' | 'event' | 'holiday' | 'competitor';

export interface ExternalSignal {
  storeId?: number | null;
  regionCode?: string | null;
  signalType: SignalType;
  occurredAt: Date;
  payload: Record<string, unknown>;
  source: string;
}

export interface SignalAdapter {
  readonly name: string;
  readonly signalType: SignalType;
  poll(opts: { regionCode?: string; storeId?: number }): Promise<ExternalSignal[]>;
}
