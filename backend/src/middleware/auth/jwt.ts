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

/**
 * 비로그인 방문자(게스트) — 로그인 없이 데모 데이터를 "조회"만 할 수 있는 읽기 전용 신원.
 *   globalRole=STORE_USER 이므로 requireAdmin(쓰기)·requirePiiAccess(개인정보)는 통과 못 한다.
 *   기본 점포는 #1(데모 점포)로 고정.
 */
const GUEST_USER: SessionUser = {
  id: 0,
  email: 'guest@demo',
  displayName: '게스트',
  globalRole: 'STORE_USER',
  stores: [{ storeId: 1, storeRole: 'STORE_STAFF' }],
};

/**
 * 세션 또는 JWT 중 하나라도 인증되면 통과.
 * 인증 정보가 없으면 — 조회(GET/HEAD)에 한해 읽기 전용 게스트로 허용한다.
 *   쓰기(POST/PATCH/DELETE 등)는 종전대로 인증을 요구한다(이후 requireAdmin 이 추가 차단).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.user) {
    return next();
  }
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return requireJwt(req, res, next);
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    (req as any).jwtUser = GUEST_USER;
    return next();
  }
  res.status(401).json({ error: 'missing_bearer' });
}
