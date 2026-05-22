/**
 * T070 — RFC 7807 Problem Details 에러 미들웨어
 *
 *   Express 의 에러 시그니처에 맞춰 application/problem+json 응답을 일관 생성.
 *   기존 라우터의 ad-hoc { error: 'xxx' } 응답과 공존 가능하도록,
 *   본 미들웨어는 next(err) 로 전달된 에러만 처리한다.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export class HttpProblem extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public extra?: Record<string, unknown>,
    public type = 'about:blank',
  ) {
    super(title);
  }
}

export function problemMiddleware(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  const problem = err instanceof HttpProblem
    ? err
    : new HttpProblem(500, 'internal_error', err?.message ?? 'unexpected error');

  if (problem.status >= 500) {
    logger.error({ err: err?.message, stack: err?.stack, path: req.originalUrl }, 'unhandled error');
  } else {
    logger.warn({ status: problem.status, title: problem.title, path: req.originalUrl }, 'client error');
  }

  res.status(problem.status);
  res.setHeader('content-type', 'application/problem+json; charset=utf-8');
  res.json({
    type: problem.type,
    title: problem.title,
    status: problem.status,
    detail: problem.detail,
    instance: req.originalUrl,
    ...(problem.extra ?? {}),
  });
}

/** 라우터 핸들러에서 throw 대신 호출하는 헬퍼 */
export function notFound(detail?: string): never {
  throw new HttpProblem(404, 'not_found', detail);
}
export function badRequest(detail?: string, extra?: Record<string, unknown>): never {
  throw new HttpProblem(400, 'bad_request', detail, extra);
}
export function forbidden(detail?: string): never {
  throw new HttpProblem(403, 'forbidden', detail);
}
