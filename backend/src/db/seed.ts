/**
 * 시드 러너 — db/seeds/*.sql 을 파일명 순서대로 실행.
 * 멱등성 보장은 각 시드 파일이 INSERT ... ON DUPLICATE KEY UPDATE 또는
 * INSERT IGNORE 를 사용하여 책임.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { getPool, closePool } from './pool';
import { logger } from '../lib/logger';

const SEEDS_DIR = path.resolve(__dirname, '../../../db/seeds');

/**
 * 데모 사용자 — bcrypt 해시는 런타임에 생성해 평문 노출 방지.
 * 시연 비밀번호는 모두 'demo1234' (개발 환경 한정).
 */
const DEMO_PASSWORD = 'demo1234';
const DEMO_USERS: Array<{
  email: string;
  display: string;
  globalRole: 'SUPER_ADMIN' | 'HQ_OPERATOR' | 'STORE_USER';
  storeAssignments: Array<{ storeId: number; storeRole: 'STORE_OWNER' | 'STORE_STAFF' }>;
}> = [
  { email: 'admin@example.com',              display: '시스템 관리자', globalRole: 'SUPER_ADMIN',  storeAssignments: [] },
  { email: 'hq@example.com',                 display: '본사 운영자',   globalRole: 'HQ_OPERATOR', storeAssignments: [] },
  { email: 'store_owner_demo@example.com',   display: '강남점주',     globalRole: 'STORE_USER',
    storeAssignments: [{ storeId: 1, storeRole: 'STORE_OWNER' }] },
  { email: 'store_staff_demo@example.com',   display: '강남직원',     globalRole: 'STORE_USER',
    storeAssignments: [{ storeId: 1, storeRole: 'STORE_STAFF' }] },
];

async function seedDemoUsers(): Promise<void> {
  const pool = getPool();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO \`user\` (email, password_hash, display_name, global_role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), global_role = VALUES(global_role)`,
      [u.email, hash, u.display, u.globalRole],
    );
    const [rows] = await pool.query<any[]>('SELECT id FROM `user` WHERE email = ?', [u.email]);
    const userId = rows[0].id;
    for (const a of u.storeAssignments) {
      await pool.query(
        `INSERT IGNORE INTO store_user (store_id, user_id, store_role) VALUES (?, ?, ?)`,
        [a.storeId, userId, a.storeRole],
      );
    }
  }
  logger.info({ count: DEMO_USERS.length, password: DEMO_PASSWORD }, 'demo users seeded');
}

function splitStatements(sql: string): string[] {
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
  const raw = await fs.readFile(path.join(SEEDS_DIR, filename), 'utf8');
  const statements = splitStatements(raw);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    await conn.commit();
    logger.info({ filename, statements: statements.length }, 'seed applied');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function main(): Promise<void> {
  const files = (await fs.readdir(SEEDS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    logger.warn({ dir: SEEDS_DIR }, 'no seed files');
    return;
  }
  for (const f of files) {
    await applyFile(f);
  }
  await seedDemoUsers();
  logger.info({ count: files.length }, 'seed run complete');
}

if (require.main === module) {
  main()
    .catch((err) => {
      logger.error({ err: err.message }, 'seed failed');
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
