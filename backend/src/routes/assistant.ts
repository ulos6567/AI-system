/**
 * 002 (T032) — AI 경영비서 라우트
 *   GET  /api/stores/:storeId/assistant/conversations            내 대화 목록
 *   GET  /api/stores/:storeId/assistant/conversations/:id/messages  대화 메시지
 *   POST /api/stores/:storeId/assistant/conversations/:id/messages  대화에 질의
 *   POST /api/stores/:storeId/assistant/ask                        새 대화로 질의
 *
 *   질의는 운영 데이터를 변경하지 않으므로 점주/직원(열람 권한)도 사용 가능.
 *   모든 질의는 assistant_query 로 감사된다(FR-027).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import { requireAuth, allowGuest } from '../middleware/auth/jwt';
import { requireStoreScope } from '../middleware/rbac';
import type { SessionUser } from '../middleware/auth/session';
import { ask, listMessages, listConversations } from '../services/assistant';

const router = Router({ mergeParams: true });

function currentUser(req: Request): SessionUser | undefined {
  return req.session?.user ?? (req as any).jwtUser;
}

/** 게스트(id 0)는 소유 사용자가 없으므로 대화/감사에 null 로 기록한다. */
function ownerId(user: SessionUser): number | null {
  return user.id && user.id > 0 ? user.id : null;
}

const AskSchema = z.object({ message: z.string().min(1).max(1000) });

router.get('/conversations', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const user = currentUser(req)!;
  res.json({ storeId, conversations: await listConversations(storeId, user.id) });
});

router.get('/conversations/:id/messages', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  res.json({ conversationId: id, messages: await listMessages(storeId, id) });
});

router.post('/conversations/:id/messages', allowGuest, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const id = Number(req.params.id);
  const user = currentUser(req)!;
  const parsed = AskSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const answer = await ask(storeId, ownerId(user), parsed.data.message, id);
  res.json(answer);
});

router.post('/ask', allowGuest, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const user = currentUser(req)!;
  const parsed = AskSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const answer = await ask(storeId, ownerId(user), parsed.data.message);
  res.json(answer);
});

export default router;
