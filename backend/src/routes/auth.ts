/**
 * T020 — /api/auth/{login, logout, me}
 *   contracts/api.yaml 의 AuthLogin / AuthMe 스키마 준수.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { loadSessionUserByEmail, touchLastLogin, emailExists, createUser } from '../services/user-loader';
import { signJwt } from '../middleware/auth/jwt';
import { audit } from '../lib/audit';
import { requireSession } from '../middleware/auth/session';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  client: z.enum(['web', 'mobile']).optional(),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(128),
});

router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const { email, password, displayName } = parsed.data;

  if (await emailExists(email)) {
    res.status(409).json({ error: 'email_taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({ email, passwordHash, displayName });

  await audit({
    userId: user.id,
    eventType: 'auth.register',
    severity: 'info',
    message: `${email} registered`,
    metadata: { client: 'web' },
  });

  // 가입 직후 자동 로그인 (세션 발급)
  req.session!.user = user;
  req.session!.save((err) => {
    if (err) {
      res.status(500).json({ error: 'session_save_failed' });
      return;
    }
    res.status(201).json({ user });
  });
});

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const { email, password, client } = parsed.data;

  const loaded = await loadSessionUserByEmail(email);
  if (!loaded) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  const ok = await bcrypt.compare(password, loaded.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  await touchLastLogin(loaded.user.id);
  await audit({
    userId: loaded.user.id,
    eventType: 'auth.login',
    severity: 'info',
    message: `${email} logged in`,
    metadata: { client: client ?? 'web' },
  });

  if (client === 'mobile') {
    const token = signJwt(loaded.user);
    res.json({ user: loaded.user, token });
    return;
  }

  req.session!.user = loaded.user;
  req.session!.save((err) => {
    if (err) {
      res.status(500).json({ error: 'session_save_failed' });
      return;
    }
    res.json({ user: loaded.user });
  });
});

router.post('/logout', (req, res) => {
  const user = req.session?.user;
  req.session?.destroy(async () => {
    if (user) {
      await audit({ userId: user.id, eventType: 'auth.logout', severity: 'info' });
    }
    res.clearCookie('mis2601.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireSession, (req, res) => {
  res.json({ user: req.session!.user });
});

export default router;
