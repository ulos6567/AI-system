/**
 * T022 — POS 어댑터 포트 (R-004 헥사고날)
 *   실제 구현: backend/src/adapters/pos/{mock,toss,nice}.ts
 */

export interface PosTransactionItem {
  localCode: string;
  quantity: number;
  unitPrice: number;
}

export interface PosTransaction {
  externalId: string;
  occurredAt: Date;
  totalAmount: number;
  paymentMethod?: string;
  posSource: 'pos' | 'self_kiosk' | 'app';
  items: PosTransactionItem[];
}

export interface PosAdapter {
  readonly name: string;
  ingestBatch(storeId: number, txs: PosTransaction[]): Promise<{ accepted: number; rejected: number }>;
  /** 시뮬레이션 스트림 (옵션) — Mock 어댑터에서만 구현 */
  startStream?(storeId: number, onTx: (tx: PosTransaction) => Promise<void>): Promise<void>;
}
