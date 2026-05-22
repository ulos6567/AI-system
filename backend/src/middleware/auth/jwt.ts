/**
 * T018 — JWT 인증 (모바일·외부 API 한정, R-003)
 *   - 웹 포털은 세션 기본. 모바일/외부 클라이언트는 Authorization: Bearer <token>.
 */
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import type { SessionUser } from './session';

export function signJwt(user: SessionUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    globalRole: user.globalRole,
    stores: user.stores,
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
}

export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_bearer' });
    return;
  }
  try {
    const decoded = jwt.verify(auth.slice(7), config.jwt.secret) as any;
    (req as any).jwtUser = {
      id: decoded.sub,
      email: decoded.email,
      displayName: decoded.email,
      globalRole: decoded.globalRole,
      stores: decoded.stores ?? [],
    } satisfies SessionUser;
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'invalid_token', detail: err.message });
  }
}

/** 세션 또는 JWT 중 하나라도 인증되면 통과 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.user) {
    return next();
  }
  return requireJwt(req, res, next);
}
