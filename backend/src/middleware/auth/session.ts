/**
 * T018 — 세션 인증 (httpOnly + CSRF 호환)
 *   - express-session + 메모리 스토어 (개발 한정).
 *   - 운영 환경에서는 connect-mysql / redis 등으로 교체 (R-003).
 */
import session from 'express-session';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../../config';

export interface SessionUser {
  id: number;
  email: string;
  displayName: string;
  globalRole: 'SUPER_ADMIN' | 'HQ_OPERATOR' | 'STORE_USER';
  stores: Array<{ storeId: number; storeRole: 'STORE_OWNER' | 'STORE_STAFF' }>;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

export const sessionMiddleware: RequestHandler = session({
  name: 'mis2601.sid',
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 1000 * 60 * 60 * 12,
  },
});

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function currentUser(req: Request): SessionUser | undefined {
  return req.session?.user;
}
