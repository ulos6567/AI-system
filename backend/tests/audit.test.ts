/**
 * 002 (T051) — 감사 일관성 점검 (FR-027, SC-012)
 *   처방/AI/이상/예지보전/스케줄의 핵심 동작이 event_log 감사를 100% 남기는지 검증한다.
 *
 *   - Part A: 스케줄 확정 경로를 DB·audit 모킹으로 호출해 'schedule_confirmed' 감사 보장.
 *   - Part B: 각 도메인 서비스 소스가 문서화된 event_type 을 실제로 emit 하는지 정적 점검
 *     (data-model.md '감사 연계' 절의 신규 event_type 셋과 일치).
 */
import fs from 'fs';
import path from 'path';

jest.mock('../src/db/pool');
jest.mock('../src/lib/audit');

import { getPool } from '../src/db/pool';
import { audit } from '../src/lib/audit';
import { confirmSchedule } from '../src/services/scheduler';

describe('audit — 스케줄 확정 (Part A, 모킹)', () => {
  beforeEach(() => {
    (audit as jest.Mock).mockReset();
    (audit as jest.Mock).mockResolvedValue(1);
  });

  it('confirmSchedule 은 schedule_confirmed 감사를 남긴다', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM work_schedule WHERE id')) {
        return [[{ id: 5, storeId: 1, weekStart: '2026-06-08', status: 'draft', estimatedLaborCost: 240000, violations: null }]];
      }
      if (sql.includes('FROM work_shift')) return [[]];
      return [{}]; // UPDATE 등
    });
    (getPool as jest.Mock).mockReturnValue({ query });

    const result = await confirmSchedule(5, 1, 9);
    expect(result.status).toBe('confirmed');

    expect(audit).toHaveBeenCalledTimes(1);
    const ev = (audit as jest.Mock).mock.calls[0][0];
    expect(ev.eventType).toBe('schedule_confirmed');
    expect(ev.storeId).toBe(1);
    expect(ev.userId).toBe(9);
    expect(ev.metadata.scheduleId).toBe(5);
  });

  it('이미 확정된 스케줄은 충돌(conflict)로 거부하고 감사하지 않는다', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM work_schedule WHERE id')) {
        return [[{ id: 5, storeId: 1, weekStart: '2026-06-08', status: 'confirmed', estimatedLaborCost: 240000, violations: null }]];
      }
      if (sql.includes('FROM work_shift')) return [[]];
      return [{}];
    });
    (getPool as jest.Mock).mockReturnValue({ query });

    await expect(confirmSchedule(5, 1, 9)).rejects.toMatchObject({ code: 'conflict' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('audit — 도메인별 event_type 보존 (Part B, 정적 점검)', () => {
  const SRC = path.resolve(__dirname, '../src/services');
  function source(file: string): string {
    return fs.readFileSync(path.join(SRC, file), 'utf8');
  }

  // data-model.md '감사 연계' — 도메인 → 보존되어야 할 신규 event_type
  const EXPECT: Record<string, string[]> = {
    'prescription.ts': ['action_approved', 'action_executed', 'action_rejected'],
    'assistant.ts': ['assistant_query'],
    'anomaly.ts': ['anomaly_notified', 'anomaly_feedback'],
    'device-health.ts': ['maintenance_alert'],
    'scheduler.ts': ['schedule_confirmed'],
  };

  for (const [file, types] of Object.entries(EXPECT)) {
    it(`${file} 은 ${types.join(', ')} 감사를 emit 한다`, () => {
      const src = source(file);
      for (const t of types) {
        expect(src).toContain(`eventType: '${t}'`);
      }
    });
  }
});
