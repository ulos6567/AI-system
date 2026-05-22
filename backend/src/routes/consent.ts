/**
 * T069 — 앱 사용자 동의 관리 라우터 (FR-020)
 *
 *   PII 영역 데이터 접근이므로 requirePiiAccessAudited 적용.
 *
 *   GET    /api/pii/users/:userId/consent              — 모든 동의 상태
 *   POST   /api/pii/users/:userId/consent/grant        — { consentType }
 *   POST   /api/pii/users/:userId/consent/revoke       — { consentType }
 *   GET    /api/pii/users/:userId/audit                — 본인 데이터 접근 이력 (event_log)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requirePiiAccessAudited } from '../middleware/pii-guard';
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';

const router = Router();
const RESOURCE = 'pii_app_user_consent';

const ConsentType = z.enum(['marketing_push', 'behavior_analytics', 'location']);
const ConsentBody = z.object({ consentType: ConsentType });

router.get('/users/:userId/consent', requireAuth, requirePiiAccessAudited(RESOURCE), async (req, res) => {
  const userId = Number(req.params.userId);
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT consent_type AS consentType, granted, granted_at AS grantedAt
       FROM pii_app_user_consent WHERE pii_app_user_id = ?`,
    [userId],
  );
  res.json({ userId, consents: rows });
});

router.post('/users/:userId/consent/grant', requireAuth, requirePiiAccessAudited(RESOURCE), async (req, res) => {
  const userId = Number(req.params.userId);
  const parsed = ConsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  const pool = getPool();
  await pool.query(
    `INSERT INTO pii_app_user_consent (pii_app_user_id, consent_type, granted, granted_at)
       VALUES (?, ?, TRUE, NOW())
     ON DUPLICATE KEY UPDATE granted = TRUE, granted_at = NOW()`,
    [userId, parsed.data.consentType],
  );
  await audit({
    eventType: 'pii.consent_granted',
    message: `user ${userId} granted ${parsed.data.consentType}`,
    metadata: { userId, consentType: parsed.data.consentType },
  });
  res.json({ ok: true });
});

router.post('/users/:userId/consent/revoke', requireAuth, requirePiiAccessAudited(RESOURCE), async (req, res) => {
  const userId = Number(req.params.userId);
  const parsed = ConsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  const pool = getPool();
  await pool.query(
    `INSERT INTO pii_app_user_consent (pii_app_user_id, consent_type, granted, granted_at)
       VALUES (?, ?, FALSE, NOW())
     ON DUPLICATE KEY UPDATE granted = FALSE, granted_at = NOW()`,
    [userId, parsed.data.consentType],
  );
  await audit({
    eventType: 'pii.consent_revoked',
    severity: 'warn',
    message: `user ${userId} revoked ${parsed.data.consentType}`,
    metadata: { userId, consentType: parsed.data.consentType },
  });
  res.json({ ok: true });
});

router.get('/users/:userId/audit', requireAuth, requirePiiAccessAudited(RESOURCE), async (req, res) => {
  const userId = Number(req.params.userId);
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, severity, event_type AS eventType, message, metadata_json AS metadata, occurred_at AS occurredAt
       FROM event_log
      WHERE event_type LIKE 'pii.%' AND JSON_EXTRACT(metadata_json, '$.userId') = ?
      ORDER BY occurred_at DESC LIMIT 100`,
    [userId],
  );
  res.json({ userId, audit: rows });
});

export default router;
