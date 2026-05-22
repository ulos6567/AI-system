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
