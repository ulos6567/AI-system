/**
 * T045 — 오프라인 로컬 보존·동기화 모듈 (FR-018)
 *
 *   - DB 연결 실패 시(예: 클라우드 단절) 거래 적재 요청을 메모리+JSONL 파일에 큐잉
 *   - 헬스 워커가 주기적으로 DB ping → 복구 감지 시 큐를 일괄 flush
 *   - flush 시 pos 어댑터의 ingestBatch 로 재시도, 성공 건은 큐에서 제거
 *   - 파일 위치: backend/.local-buffer.jsonl (gitignore 권장 — .env* 패턴에 묶이지 않으니 별도 .gitignore 라인 추가됨)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPool } from '../db/pool';
import { logger } from '../lib/logger';
import { audit } from '../lib/audit';
import { getPosAdapter } from '../adapters/factory';
import type { PosTransaction } from '../ports/pos';

const BUFFER_FILE = path.resolve(__dirname, '../../.local-buffer.jsonl');
const PING_INTERVAL_MS = 15_000;

interface BufferedItem {
  storeId: number;
  tx: PosTransaction;
  bufferedAt: string;
}

const memory: BufferedItem[] = [];
let online = true;
let pingHandle: NodeJS.Timeout | null = null;

async function appendToFile(item: BufferedItem): Promise<void> {
  try {
    await fs.appendFile(BUFFER_FILE, JSON.stringify(item) + '\n', 'utf8');
  } catch (err: any) {
    logger.error({ err: err.message }, 'local-buffer file append failed');
  }
}

async function loadFromFile(): Promise<void> {
  try {
    const raw = await fs.readFile(BUFFER_FILE, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        item.tx.occurredAt = new Date(item.tx.occurredAt);
        memory.push(item);
      } catch { /* ignore */ }
    }
    if (memory.length > 0) {
      logger.warn({ count: memory.length }, 'local-buffer loaded existing items from file');
    }
  } catch {
    // 파일 없음 — 정상
  }
}

async function pingDb(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function flush(): Promise<{ flushed: number; failed: number }> {
  if (memory.length === 0) return { flushed: 0, failed: 0 };
  const adapter = getPosAdapter();
  // store 별로 묶어서 ingestBatch
  const byStore = new Map<number, BufferedItem[]>();
  for (const it of memory) {
    if (!byStore.has(it.storeId)) byStore.set(it.storeId, []);
    byStore.get(it.storeId)!.push(it);
  }
  let flushed = 0;
  let failed = 0;
  const remaining: BufferedItem[] = [];
  for (const [storeId, items] of byStore) {
    try {
      const res = await adapter.ingestBatch(storeId, items.map((i) => i.tx));
      flushed += res.accepted;
      failed += res.rejected;
    } catch (err: any) {
      logger.error({ err: err.message, storeId, count: items.length }, 'flush ingest failed');
      remaining.push(...items);
    }
  }
  memory.length = 0;
  memory.push(...remaining);
  try {
    if (memory.length === 0) await fs.unlink(BUFFER_FILE).catch(() => undefined);
    else {
      await fs.writeFile(BUFFER_FILE, memory.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'flush file rewrite failed');
  }
  if (flushed > 0 || failed > 0) {
    await audit({
      eventType: 'sync.flushed',
      severity: failed > 0 ? 'warn' : 'info',
      message: `flushed=${flushed} failed=${failed}`,
      metadata: { flushed, failed },
    });
  }
  return { flushed, failed };
}

export async function bufferTransaction(storeId: number, tx: PosTransaction): Promise<void> {
  const item: BufferedItem = { storeId, tx, bufferedAt: new Date().toISOString() };
  memory.push(item);
  await appendToFile(item);
  logger.warn({ storeId, externalId: tx.externalId, bufferedTotal: memory.length }, 'tx buffered (offline)');
}

export function isOnline(): boolean {
  return online;
}

export function bufferedCount(): number {
  return memory.length;
}

export async function startLocalBufferWorker(): Promise<void> {
  await loadFromFile();
  pingHandle = setInterval(async () => {
    const ok = await pingDb();
    if (ok && !online) {
      online = true;
      logger.info({ buffered: memory.length }, 'DB recovered — flushing local buffer');
      await audit({
        eventType: 'system.recovered',
        severity: 'info',
        message: `DB recovered. flushing ${memory.length} buffered items`,
        metadata: { buffered: memory.length },
      });
      await flush();
    } else if (!ok && online) {
      online = false;
      logger.error({}, 'DB ping failed — switching to offline mode');
      // DB 가 안되니 audit 도 못 적재. 로그로만 알림.
    } else if (ok && memory.length > 0) {
      await flush();
    }
  }, PING_INTERVAL_MS);
  logger.info({ intervalSec: PING_INTERVAL_MS / 1000 }, 'local-buffer worker started');
}

export function stopLocalBufferWorker(): void {
  if (pingHandle) clearInterval(pingHandle);
  pingHandle = null;
}
