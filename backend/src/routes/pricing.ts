/**
 * T053·T054 — /api/pricing/rules CRUD + /api/stores/:storeId/pricing-events
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth/jwt';
import { requireAdmin, requireStoreScope } from '../middleware/rbac';
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { evaluateRule, listPricingEvents } from '../services/pricing';

const rulesRouter = Router();
const eventsRouter = Router({ mergeParams: true });

const TriggerType = z.enum(['shelf_life', 'weather', 'demand_drop', 'schedule', 'manual']);
const ActionType = z.enum(['percent_off', 'fixed_price', 'bundle']);

const RuleSchema = z.object({
  storeId: z.number().int().nullable().optional(),
  name: z.string().min(1).max(128),
  triggerType: TriggerType,
  triggerConfig: z.record(z.any()).optional(),
  actionType: ActionType,
  actionConfig: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

const RuleUpdateSchema = RuleSchema.partial();

// GET /api/pricing/rules?storeId=
rulesRouter.get('/rules', requireAuth, async (req, res) => {
  const pool = getPool();
  const storeIdParam = req.query.storeId ? Number(req.query.storeId) : null;
  const args: any[] = [];
  const wheres: string[] = [];
  if (storeIdParam !== null) {
    wheres.push('(store_id = ? OR store_id IS NULL)');
    args.push(storeIdParam);
  }
  const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const [rows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, name,
            trigger_type AS triggerType, trigger_config_json AS triggerConfig,
            action_type AS actionType, action_config_json AS actionConfig,
            is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
       FROM pricing_rule
       ${whereSql}
      ORDER BY id DESC`,
    args,
  );
  res.json({ rules: rows });
});

rulesRouter.post('/rules', requireAuth, requireAdmin, async (req, res) => {
  const parsed = RuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const r = parsed.data;
  const pool = getPool();
  const [result]: any = await pool.query(
    `INSERT INTO pricing_rule
       (store_id, name, trigger_type, trigger_config_json, action_type, action_config_json, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      r.storeId ?? null,
      r.name,
      r.triggerType,
      r.triggerConfig ? JSON.stringify(r.triggerConfig) : null,
      r.actionType,
      r.actionConfig ? JSON.stringify(r.actionConfig) : null,
      r.isActive ?? true,
    ],
  );
  const id = result.insertId as number;
  await audit({
    storeId: r.storeId ?? null,
    eventType: 'pricing.rule_created',
    message: `rule #${id} (${r.name})`,
    metadata: { ruleId: id, ...r },
  });
  res.json({ id, ok: true });
});

rulesRouter.patch('/rules/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RuleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const updates: string[] = [];
  const args: any[] = [];
  const p = parsed.data;
  if (p.storeId !== undefined) { updates.push('store_id = ?'); args.push(p.storeId ?? null); }
  if (p.name !== undefined) { updates.push('name = ?'); args.push(p.name); }
  if (p.triggerType !== undefined) { updates.push('trigger_type = ?'); args.push(p.triggerType); }
  if (p.triggerConfig !== undefined) { updates.push('trigger_config_json = ?'); args.push(p.triggerConfig ? JSON.stringify(p.triggerConfig) : null); }
  if (p.actionType !== undefined) { updates.push('action_type = ?'); args.push(p.actionType); }
  if (p.actionConfig !== undefined) { updates.push('action_config_json = ?'); args.push(p.actionConfig ? JSON.stringify(p.actionConfig) : null); }
  if (p.isActive !== undefined) { updates.push('is_active = ?'); args.push(p.isActive); }
  if (updates.length === 0) {
    res.status(400).json({ error: 'no_fields' });
    return;
  }
  args.push(id);
  const pool = getPool();
  await pool.query(`UPDATE pricing_rule SET ${updates.join(', ')} WHERE id = ?`, args);
  await audit({ eventType: 'pricing.rule_updated', message: `rule #${id}`, metadata: { ruleId: id, ...p } });
  res.json({ id, ok: true });
});

rulesRouter.delete('/rules/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const pool = getPool();
  await pool.query(`DELETE FROM pricing_rule WHERE id = ?`, [id]);
  await audit({ eventType: 'pricing.rule_deleted', message: `rule #${id}`, metadata: { ruleId: id } });
  res.json({ id, ok: true });
});

// POST /api/pricing/rules/:id/evaluate { storeId? }  — 즉시 1회 평가 (수동/검증용)
rulesRouter.post('/rules/:id/evaluate', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const storeIdOverride = req.body?.storeId ? Number(req.body.storeId) : undefined;
  try {
    const applied = await evaluateRule(id, { storeIdOverride });
    res.json({ id, applied: applied.length, events: applied });
  } catch (err: any) {
    res.status(400).json({ error: 'evaluate_failed', detail: err.message });
  }
});

// GET /api/stores/:storeId/pricing-events?limit=
eventsRouter.get('/', requireAuth, requireStoreScope(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const limit = Math.min(500, Number(req.query.limit ?? 100));
  const rows = await listPricingEvents(storeId, limit);
  res.json({ storeId, events: rows });
});

export { rulesRouter, eventsRouter };
