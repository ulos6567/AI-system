/**
 * T024 — SSE 인프라 헬퍼 (R-002)
 *
 *   - 채널별 클라이언트 집합 관리 (점포 스코프 또는 사용자 스코프).
 *   - 하트비트(30초)로 idle connection 유지.
 *   - 운영 환경에서는 Nginx 의 proxy_buffering off / proxy_read_timeout 1h 필수
 *     (docker/nginx/default.conf 참고).
 *
 * 사용 예:
 *   const bus = getEventBus();
 *   router.get('/stream', (req, res) => bus.subscribe(`store:${storeId}`, req, res));
 *   // 다른 곳에서 발행:
 *   bus.publish(`store:${storeId}`, { type: 'inventory.stockout', data: ... });
 */
import { Request, Response } from 'express';
import { logger } from './logger';

export interface SseMessage {
  type: string;
  data: unknown;
  id?: string;
}

class EventBus {
  private channels = new Map<string, Set<Response>>();
  private heartbeatHandle: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_MS = 30_000;

  subscribe(channel: string, req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx 보조
    res.flushHeaders?.();
    res.write(`: connected ${new Date().toISOString()}\n\n`);

    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(res);

    this.ensureHeartbeat();

    req.on('close', () => {
      this.channels.get(channel)?.delete(res);
      if (this.channels.get(channel)?.size === 0) this.channels.delete(channel);
      logger.debug({ channel }, 'sse client disconnected');
    });
  }

  publish(channel: string, msg: SseMessage): number {
    const clients = this.channels.get(channel);
    if (!clients || clients.size === 0) return 0;
    const payload = this.format(msg);
    for (const res of clients) {
      try {
        res.write(payload);
      } catch (err: any) {
        logger.warn({ err: err.message, channel }, 'sse write failed, dropping client');
        clients.delete(res);
      }
    }
    return clients.size;
  }

  private format(msg: SseMessage): string {
    const lines: string[] = [];
    if (msg.id) lines.push(`id: ${msg.id}`);
    lines.push(`event: ${msg.type}`);
    lines.push(`data: ${JSON.stringify(msg.data)}`);
    return lines.join('\n') + '\n\n';
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatHandle) return;
    this.heartbeatHandle = setInterval(() => {
      for (const [channel, clients] of this.channels) {
        for (const res of clients) {
          try {
            res.write(`: ping ${Date.now()}\n\n`);
          } catch {
            clients.delete(res);
          }
        }
        if (clients.size === 0) this.channels.delete(channel);
      }
    }, this.HEARTBEAT_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }
}

let _bus: EventBus | null = null;
export function getEventBus(): EventBus {
  if (!_bus) _bus = new EventBus();
  return _bus;
}
