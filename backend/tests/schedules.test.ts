/**
 * 002 (T047) — 인력 스케줄러 테스트.
 *   - 라우트 인증/권한 게이팅 스모크(DB 비의존).
 *   - 순수 배정기(planSchedule)의 법정 제약 100% 준수 또는 위반 명시 검증(FR-023, SC-011).
 */
import request from 'supertest';
import { createApp } from '../src/index';
import {
  planSchedule,
  type EmployeeRow,
  MAX_WEEKLY_HOURS,
  MAX_CONSECUTIVE_DAYS,
} from '../src/services/scheduler';

const app = createApp();

function weekDates(startISO: string): Date[] {
  const start = new Date(startISO + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function fullAvail(id: number, wage = 11000): EmployeeRow {
  return { id, name: `직원${id}`, hourlyWage: wage, availability: { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24 } };
}

describe('schedules routes smoke', () => {
  it('read endpoints require auth (401/403 without session)', async () => {
    for (const p of ['/api/stores/1/schedules', '/api/stores/1/schedules/1']) {
      const res = await request(app).get(p);
      expect([401, 403]).toContain(res.status);
    }
  });

  it('write endpoints (generate/confirm) require auth + admin', async () => {
    const gen = await request(app).post('/api/stores/1/schedules/generate').send({ weekStart: '2026-06-08' });
    expect([401, 403]).toContain(gen.status);
    const conf = await request(app).post('/api/stores/1/schedules/1/confirm').send({});
    expect([401, 403]).toContain(conf.status);
  });
});

describe('planSchedule — 법정 제약 (FR-023, SC-011)', () => {
  // 모든 일자에 높은 수요(시프트당 2명 필요) 부여
  const dates = weekDates('2026-06-08'); // 월요일 시작
  const demand = new Map(dates.map((d) => [d.toISOString().slice(0, 10), 200]));

  it('배정된 모든 시프트가 제약을 100% 준수한다 (충분한 인원)', () => {
    const employees = Array.from({ length: 12 }, (_, i) => fullAvail(i + 1));
    const { shifts, violations } = planSchedule(employees, dates, demand);

    // 1) 1일 1시프트 — (employee, date) 중복 없음
    const seen = new Set<string>();
    for (const s of shifts) {
      const key = `${s.employeeId}@${s.shiftDate}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    // 2) 주당 최대 근로시간 준수
    const hours = new Map<number, number>();
    for (const s of shifts) hours.set(s.employeeId, (hours.get(s.employeeId) ?? 0) + 8);
    for (const h of hours.values()) expect(h).toBeLessThanOrEqual(MAX_WEEKLY_HOURS);

    // 3) 연속 근무일 한도 준수
    const byEmp = new Map<number, string[]>();
    for (const s of shifts) {
      const arr = byEmp.get(s.employeeId) ?? [];
      arr.push(s.shiftDate);
      byEmp.set(s.employeeId, arr);
    }
    for (const days of byEmp.values()) {
      const sorted = [...new Set(days)].sort();
      let run = 1;
      let maxRun = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T00:00:00');
        const cur = new Date(sorted[i] + 'T00:00:00');
        const diff = (cur.getTime() - prev.getTime()) / 86400000;
        run = diff === 1 ? run + 1 : 1;
        maxRun = Math.max(maxRun, run);
      }
      expect(maxRun).toBeLessThanOrEqual(MAX_CONSECUTIVE_DAYS);
    }

    // 충분한 인원이면 위반(인원 부족) 없음
    expect(violations).toHaveLength(0);
  });

  it('인원이 부족하면 위반을 명시하되, 배정분은 여전히 제약을 준수한다', () => {
    const employees = [fullAvail(1), fullAvail(2)]; // 명백히 부족
    const { shifts, violations } = planSchedule(employees, dates, demand);
    expect(violations.length).toBeGreaterThan(0);

    // 부족 상황에서도 주52h·연속6일 제약은 깨지지 않는다
    const hours = new Map<number, number>();
    for (const s of shifts) hours.set(s.employeeId, (hours.get(s.employeeId) ?? 0) + 8);
    for (const h of hours.values()) expect(h).toBeLessThanOrEqual(MAX_WEEKLY_HOURS);
  });

  it('직원이 없으면 위반으로 명시한다', () => {
    const { shifts, violations } = planSchedule([], dates, demand);
    expect(shifts).toHaveLength(0);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('가용성(요일·시간대) 밖으로는 배정하지 않는다', () => {
    // 평일(월~금)·오전만 가용 → close(14-22) 시프트엔 절대 배정 불가
    const weekdayMorning: EmployeeRow = {
      id: 1, name: '오전직원', hourlyWage: 11000,
      availability: { days: [1, 2, 3, 4, 5], startHour: 7, endHour: 15 },
    };
    const { shifts } = planSchedule([weekdayMorning], dates, demand);
    for (const s of shifts) {
      // 주말 미배정
      const dow = new Date(s.shiftDate + 'T00:00:00').getDay();
      expect([1, 2, 3, 4, 5]).toContain(dow);
      // open 시프트(07-15)만 가능
      expect(s.startTime).toBe('07:00');
    }
  });
});
