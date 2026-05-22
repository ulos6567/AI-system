/**
 * T071 — OpenAPI 정적 노출 (개발 전용)
 *   GET /api/docs       — Swagger UI
 *   GET /api/docs.json  — 원본 OpenAPI(YAML → JSON)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';

const SPEC_PATH = path.resolve(__dirname, '../../../specs/001-ai-store-ops/contracts/api.yaml');

let cached: any = null;
async function loadSpec(): Promise<any> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(SPEC_PATH, 'utf8');
    cached = yaml.load(raw);
  } catch {
    cached = { openapi: '3.0.0', info: { title: 'spec not found', version: '0.0' }, paths: {} };
  }
  return cached;
}

const router = Router();

router.get('/docs.json', async (_req, res) => {
  res.json(await loadSpec());
});

router.use('/docs', swaggerUi.serve, async (req: any, res: any, next: any) => {
  const spec = await loadSpec();
  return swaggerUi.setup(spec, { explorer: true })(req, res, next);
});

export default router;
