/** T022 — ESL(전자선반라벨) 어댑터 포트 */

export interface EslPushRequest {
  storeId: number;
  productMasterId: number;
  shelfLocation?: string;
  originalPrice: number;
  adjustedPrice: number;
  effectiveFrom: Date;
  effectiveTo: Date;
}

export interface EslAdapter {
  readonly name: string;
  enqueue(req: EslPushRequest): Promise<{ status: 'pending' | 'sent' | 'failed'; reason?: string }>;
}
