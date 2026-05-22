/** T022 — 물류 자동 발주 어댑터 포트 (mock CSV / 후속: EDI/REST) */

export interface LogisticsOrderItem {
  productMasterId: number;
  quantity: number;
}

export interface LogisticsOrderRequest {
  storeId: number;
  purchaseOrderId: number;
  items: LogisticsOrderItem[];
  desiredDeliveryDate: Date;
}

export interface LogisticsAdapter {
  readonly name: string;
  send(req: LogisticsOrderRequest): Promise<{
    externalRef: string;
    accepted: boolean;
    estimatedDelivery?: Date;
    rawResponse?: unknown;
  }>;
}
