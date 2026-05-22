/**
 * T066 — PII 접근 가드 미들웨어 (FR-019, FR-020, R-006)
 *
 *   - `pii_*` 라우터에 마운트: 접근자가 SUPER_ADMIN 또는 HQ_OPERATOR + `PII_ACCESS` 권한 보유 시만 통과.
 *   - 통과/거부 모두 audit (`pii.access_granted` / `pii.access_denied`) — 누가 어떤 자원에 접근했는지 추적 가능.
 *   - 1차 구현은 글로벌 역할만으로 판단 (PII_ACCESS 별도 권한 테이블은 후속).
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { audit } from '../lib/audit';
import type { SessionUser } from './auth/session';

function getUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

export function requirePiiAccessAudited(resource: string): RequestHandler {
  return async (req, res, next) => {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const allowed = user.globalRole === 'SUPER_ADMIN' || user.globalRole === 'HQ_OPERATOR';
    if (!allowed) {
      await audit({
        userId: user.id,
        severity: 'warn',
        eventType: 'pii.access_denied',
        message: `denied ${req.method} ${req.originalUrl} (${resource})`,
        metadata: { method: req.method, path: req.originalUrl, resource, role: user.globalRole },
      });
      res.status(403).json({ error: 'pii_access_required', resource });
      return;
    }
    await audit({
      userId: user.id,
      eventType: 'pii.access_granted',
      message: `${user.email} ${req.method} ${req.originalUrl}`,
      metadata: { method: req.method, path: req.originalUrl, resource },
    });
    next();
  };
}
