/**
 * T051 — ESL 모의 어댑터 (이벤트 큐 + DB 로그)
 *   - enqueue 호출 시 메모리 큐에 추가하고 즉시 'pending' 반환.
 *   - 비동기 워커가 1초 후 'sent' 로 전이된 것으로 가정 (실제는 ESL 벤더 API).
 *   - DB 로그: event_log 에 esl.queued 적재.
 */
import type { EslAdapter, EslPushRequest } from '../../ports/esl';
import { logger } from '../../lib/logger';
import { audit } from '../../lib/audit';

interface QueuedItem {
  id: string;
  req: EslPushRequest;
  enqueuedAt: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed';
}

const QUEUE: QueuedItem[] = [];

function generateId(): string {
  return `ESL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const adapter: EslAdapter = {
  name: 'esl-mock',
  async enqueue(req: EslPushRequest) {
    const item: QueuedItem = {
      id: generateId(),
      req,
      enqueuedAt: new Date(),
      status: 'pending',
    };
    QUEUE.push(item);
    // 비동기 sent 전이 모사
    setTimeout(() => {
      item.status = 'sent';
      item.sentAt = new Date();
    }, 1000);

    await audit({
      storeId: req.storeId,
      eventType: 'esl.queued',
      message: `${req.productMasterId} → ₩${req.adjustedPrice} (was ₩${req.originalPrice})`,
      metadata: {
        productMasterId: req.productMasterId,
        shelfLocation: req.shelfLocation,
        adjustedPrice: req.adjustedPrice,
        originalPrice: req.originalPrice,
        eslMockId: item.id,
        effectiveFrom: req.effectiveFrom,
        effectiveTo: req.effectiveTo,
      },
    });
    logger.info({ id: item.id, store: req.storeId, product: req.productMasterId }, 'esl-mock enqueued');
    return { status: 'pending' as const };
  },
};

export function getEslQueueSnapshot(limit = 100): QueuedItem[] {
  return QUEUE.slice(-limit).reverse();
}

export default adapter;
