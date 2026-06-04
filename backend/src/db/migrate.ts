/**
 * 마이그레이션 러너 (R-005)
 *   - db/migrations/*.sql 을 파일명 사전순으로 순차 실행
 *   - _migrations 테이블에 적용 이력 기록 (멱등)
 *   - 멀티스테이트먼트 미허용 — 파일 내 ;로 분리해 순차 실행
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPool, closePool } from './pool';
import { logger } from '../lib/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');

async function ensureMigrationTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum CHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function splitStatements(sql: string): string[] {
  // 라인 기반 분리: 주석/빈줄 무시, 끝이 ';' 인 라인을 statement 종료로 본다.
  // DELIMITER 미지원. 문자열 리터럴 안의 ';' 는 고려하지 않음(스키마 SQL 가정).
  const out: string[] = [];
  let cur = '';
  for (const raw of sql.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    cur += raw + '\n';
    if (trimmed.endsWith(';')) {
      const stmt = cur.replace(/;\s*$/, '').trim();
      if (stmt) out.push(stmt);
      cur = '';
    }
  }
  const tail = cur.trim();
  if (tail) out.push(tail.replace(/;\s*$/, ''));
  return out;
}

async function applyFile(filename: string): Promise<void> {
  const pool = getPool();
  const full = path.join(MIGRATIONS_DIR, filename);
  const raw = await fs.readFile(full, 'utf8');
  const { createHash } = await import('node:crypto');
  const checksum = createHash('sha256').update(raw).digest('hex');

  const [rows] = await pool.query<any[]>('SELECT checksum FROM _migrations WHERE filename = ?', [
    filename,
  ]);
  if (rows.length > 0) {
    if (rows[0].checksum !== checksum) {
      throw new Error(`[migrate] checksum mismatch for ${filename} (already applied with different content)`);
    }
    logger.debug({ filename }, 'migration already applied, skipping');
    return;
  }

  const statements = splitStatements(raw);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    await conn.query('INSERT INTO _migrations (filename, checksum) VALUES (?, ?)', [
      filename,
      checksum,
    ]);
    await conn.commit();
    logger.info({ filename, statements: statements.length }, 'migration applied');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function main(): Promise<void> {
  await ensureMigrationTable();
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    logger.warn({ dir: MIGRATIONS_DIR }, 'no migration files found');
    return;
  }

  for (const f of files) {
    await applyFile(f);
  }
  logger.info({ count: files.length }, 'migration run complete');
}

if (require.main === module) {
  main()
    .catch((err) => {
      logger.error({ err: err.message }, 'migration failed');
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
