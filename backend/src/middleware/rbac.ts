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
 * 쓰기 가드 — 본사급 관리자(SUPER_ADMIN / HQ_OPERATOR)만 통과.
 *   점주(STORE_OWNER)·직원(STORE_STAFF)·신규 가입자(STORE_USER)는 모두 읽기 전용.
 *   발주 승인, 가격 룰 변경, 매핑 수정 등 모든 운영 데이터 변경 동작에 적용. (운영 정책)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (user.globalRole === 'SUPER_ADMIN' || user.globalRole === 'HQ_OPERATOR') {
    next();
    return;
  }
  res.status(403).json({ error: 'admin_required', requires: ['SUPER_ADMIN', 'HQ_OPERATOR'] });
}

/**
 * 점포 스코프 가드 (읽기 허용 정책).
 *   - 로그인한 사용자는 누구나 점포 데이터를 "조회(GET)"할 수 있다 — 열람 전용 방문자 포함.
 *   - 데이터를 변경하는 쓰기 라우트에는 이 가드 뒤에 항상 `requireAdmin` 이 붙어
 *     SUPER_ADMIN / HQ_OPERATOR 만 통과하므로, 여기서 막지 않아도 쓰기는 안전하게 차단된다.
 *   - storeId 파라미터의 형식만 검증한다.
 */
export function requireStoreScope(paramName = 'storeId'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const storeId = Number(req.params[paramName]);
    if (!Number.isFinite(storeId)) {
      res.status(400).json({ error: 'invalid_store_id' });
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
