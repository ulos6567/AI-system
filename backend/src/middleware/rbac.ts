/**
 * T019 — RBAC + 점포 스코프 가드 (FR-019)
 *   4 역할:
 *     SUPER_ADMIN  — 전체 권한
 *     HQ_OPERATOR  — 모든 점포 read, 일부 write
 *     STORE_OWNER  — 자기 점포 전체 권한 (store_user 매핑 기반)
 *     STORE_STAFF  — 자기 점포 read + 거래/재고 일부 write
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { SessionUser } from './auth/session';

export type EffectiveRole = 'SUPER_ADMIN' | 'HQ_OPERATOR' | 'STORE_OWNER' | 'STORE_STAFF';

function getUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

export function requireRole(...roles: EffectiveRole[]): RequestHandler {
  return (req, res, next) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (user.globalRole === 'SUPER_ADMIN') return next();
    if (roles.includes(user.globalRole as EffectiveRole)) return next();
    const hasStoreRole = user.stores.some((s) => roles.includes(s.storeRole));
    if (hasStoreRole) return next();
    res.status(403).json({ error: 'forbidden', requires: roles });
  };
}

/**
 * URL 파라미터 :storeId 가 사용자의 점포 스코프에 포함되는지 검사.
 *   SUPER_ADMIN / HQ_OPERATOR 는 통과.
 */
export function requireStoreScope(paramName = 'storeId'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (user.globalRole === 'SUPER_ADMIN' || user.globalRole === 'HQ_OPERATOR') {
      return next();
    }
    const storeId = Number(req.params[paramName]);
    if (!Number.isFinite(storeId)) {
      res.status(400).json({ error: 'invalid_store_id' });
      return;
    }
    const allowed = user.stores.some((s) => s.storeId === storeId);
    if (!allowed) {
      res.status(403).json({ error: 'forbidden_store_scope', storeId });
      return;
    }
    next();
  };
}

/** PII 영역(`pii_*` 테이블) 접근 가드 — 상세는 T066에서 강화 */
export function requirePiiAccess(req: Request, res: Response, next: NextFunction): void {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (user.globalRole !== 'SUPER_ADMIN' && user.globalRole !== 'HQ_OPERATOR') {
    res.status(403).json({ error: 'pii_access_required' });
    return;
  }
  next();
}
