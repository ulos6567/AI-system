/**
 * 백엔드 호출 공통 래퍼.
 *   - credentials: 'include' → 세션 쿠키 자동 전송 (CORS 백엔드와 일치)
 *   - 401 → auth store 의 setUser(null) 호출 (라우터 가드가 /login 으로 보냄)
 */
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { skipUnauthorizedHandler?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has('content-type') && typeof init.body === 'string') {
    headers.set('content-type', 'application/json');
  }
  const { skipUnauthorizedHandler, ...fetchInit } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...fetchInit,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    if (!skipUnauthorizedHandler && path !== '/auth/me') onUnauthorized?.();
    throw new ApiError(401, 'unauthorized');
  }
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, (body as any)?.error ?? res.statusText, body);
  }
  return body as T;
}
