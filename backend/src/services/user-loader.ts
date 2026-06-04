/**
 * 사용자/점포 권한 로더 — 로그인 직후 store_user 매핑을 합쳐 SessionUser 구성.
 */
import { getPool } from '../db/pool';
import type { SessionUser } from '../middleware/auth/session';

export async function loadSessionUserByEmail(email: string): Promise<{ user: SessionUser; passwordHash: string } | null> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    'SELECT id, email, password_hash, display_name, global_role FROM `user` WHERE email = ?',
    [email],
  );
  if (rows.length === 0) return null;
  const u = rows[0];
  const [stores] = await pool.query<any[]>(
    'SELECT store_id AS storeId, store_role AS storeRole FROM store_user WHERE user_id = ?',
    [u.id],
  );
  return {
    passwordHash: u.password_hash as string,
    user: {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      globalRole: u.global_role,
      stores: stores.map((s: any) => ({ storeId: s.storeId, storeRole: s.storeRole })),
    },
  };
}

export async function touchLastLogin(userId: number): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE `user` SET last_login_at = NOW() WHERE id = ?', [userId]);
}

export async function emailExists(email: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>('SELECT id FROM `user` WHERE email = ?', [email]);
  return rows.length > 0;
}

/**
 * 신규 사용자 생성 — 회원가입 기본 권한은 STORE_USER, 점포 매핑 없음.
 * 반환값은 로그인 직후와 동일한 SessionUser 형태.
 */
export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
}): Promise<SessionUser> {
  const pool = getPool();
  const [result] = await pool.query<any>(
    'INSERT INTO `user` (email, password_hash, display_name, global_role) VALUES (?, ?, ?, ?)',
    [input.email, input.passwordHash, input.displayName, 'STORE_USER'],
  );
  return {
    id: result.insertId,
    email: input.email,
    displayName: input.displayName,
    globalRole: 'STORE_USER',
    stores: [],
  };
}
