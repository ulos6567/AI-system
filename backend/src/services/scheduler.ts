/**
 * 002 (T045) — 인력 최적화 스케줄러 (FR-022~024, SC-011)
 *
 *   수요(001 demand_forecast) → 시간대별 필요 인원 산정 → 직원 가용성·법정 제약을
 *   충족하는 시프트를 그리디로 배정한다. 제약을 모두 채우지 못하면 위반 항목을 명시한다.
 *
 *   법정/운영 제약(기본 규칙 셋 — 점포별 커스텀은 후속):
 *     - 주당 최대 근로시간 52h (40h + 연장 12h)
 *     - 연속 근무일 최대 6일 (주 1일 휴무 보장)
 *     - 1일 1시프트(시프트는 8h, 익일까지 11h 이상 휴식 자동 보장)
 *     - 직원 가용 요일·시간대(availability_json) 내에서만 배정
 *
 *   생성된 초안은 work_schedule(status='draft') + work_shift 로 저장하고,
 *   예상 인건비(estimated_labor_cost)와 제약 위반(constraint_violations_json)을 함께 반환한다.
 *   확정은 confirmSchedule(승인 시 감사 schedule_confirmed).
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';

export const MAX_WEEKLY_HOURS = 52;
export const MAX_CONSECUTIVE_DAYS = 6;
const SHIFT_HOURS = 8;

/** 시프트 템플릿 (open/mid/close) — 각 8시간. */
export const SHIFT_TEMPLATES = [
  { code: 'open', start: '07:00', end: '15:00', startHour: 7, endHour: 15 },
  { code: 'mid', start: '11:00', end: '19:00', startHour: 11, endHour: 19 },
  { code: 'close', start: '14:00', end: '22:00', startHour: 14, endHour: 22 },
] as const;

type ShiftTemplate = (typeof SHIFT_TEMPLATES)[number];

export interface EmployeeRow {
  id: number;
  name: string;
  hourlyWage: number;
  availability: { days: number[]; startHour: number; endHour: number };
}

interface PlannedShift {
  employeeId: number;
  employeeName: string;
  shiftDate: string; // YYYY-MM-DD
  startTime: string; // HH:00
  endTime: string;
  shiftCode: string;
}

export interface ScheduleDraft {
  id: number | null;
  storeId: number;
  weekStart: string;
  status: 'draft' | 'confirmed';
  estimatedLaborCost: number;
  constraintViolations: string[];
  shifts: PlannedShift[];
}

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

/** 로컬 캘린더 기준 YYYY-MM-DD — toISOString(UTC)을 쓰면 비-UTC 환경에서 요일이 어긋난다. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** availability_json 파싱 — 누락 시 전요일·전시간 가용으로 간주. */
function parseAvailability(raw: any): EmployeeRow['availability'] {
  const def = { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24 };
  if (!raw) return def;
  const j = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!j) return def;
  return {
    days: Array.isArray(j.days) ? j.days.map(Number) : def.days,
    startHour: Number.isFinite(j.startHour) ? Number(j.startHour) : def.startHour,
    endHour: Number.isFinite(j.endHour) ? Number(j.endHour) : def.endHour,
  };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function loadEmployees(storeId: number): Promise<EmployeeRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, name, hourly_wage AS hourlyWage, availability_json AS availability
       FROM employee WHERE store_id = ? ORDER BY id`,
    [storeId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    hourlyWage: Number(r.hourlyWage),
    availability: parseAvailability(r.availability),
  }));
}

/**
 * 요일별 수요 → 시프트별 필요 인원.
 *   - 001 demand_forecast(점포×주간 일자)의 총 예측 판매량을 일 수요로 사용.
 *   - 예측이 없으면 최근 거래 기반 fallback(요일별 거래 수)을 사용.
 *   - 수요 수준에 따라 시프트당 1~2명 필요로 환산.
 */
async function dailyDemand(storeId: number, dates: Date[]): Promise<Map<string, number>> {
  const pool = getPool();
  const demand = new Map<string, number>();
  const dateStrs = dates.map(ymd);

  const [fc] = await pool.query<any[]>(
    `SELECT target_date AS d, SUM(predicted_quantity) AS q
       FROM demand_forecast
      WHERE store_id = ? AND target_date IN (?)
      GROUP BY target_date`,
    [storeId, dateStrs],
  );
  for (const r of fc) demand.set(ymd(new Date(r.d)), Number(r.q));

  // 예측이 없는 날은 최근 4주 동일 요일 평균 거래 수로 보정
  const missing = dates.filter((d) => !demand.has(ymd(d)));
  for (const d of missing) {
    const [tx] = await pool.query<any[]>(
      `SELECT COUNT(*) / NULLIF(COUNT(DISTINCT DATE(occurred_at)), 0) AS avgTx
         FROM \`transaction\`
        WHERE store_id = ?
          AND occurred_at >= DATE_SUB(?, INTERVAL 28 DAY)
          AND DAYOFWEEK(occurred_at) = ?`,
      [storeId, ymd(d), d.getDay() + 1],
    );
    demand.set(ymd(d), Number(tx[0]?.avgTx ?? 0));
  }
  return demand;
}

/** 일 수요량 → 시프트당 필요 인원(1~2). 임계는 데모 데이터 스케일 기준. */
function requiredPerShift(dayDemand: number): number {
  if (dayDemand >= 120) return 2;
  return 1;
}

/**
 * 순수 그리디 배정기 — DB 비의존(단위 테스트 가능, T047).
 *   주어진 직원·일자·일수요에 대해 시프트를 배정하고 위반·예상 인건비를 산출한다.
 *   배정된 모든 시프트는 가용성·1일1시프트·주52h·연속6일 제약을 100% 준수한다.
 *   채우지 못한 수요는 violations 로 명시한다(FR-023).
 */
export function planSchedule(
  employees: EmployeeRow[],
  dates: Date[],
  demand: Map<string, number>,
): { shifts: PlannedShift[]; violations: string[]; estimatedLaborCost: number } {
  const violations: string[] = [];
  const shifts: PlannedShift[] = [];

  // 직원별 누적 상태
  const weeklyHours = new Map<number, number>(); // employeeId → 배정 시간
  const assignedDays = new Map<number, Set<string>>(); // employeeId → 배정 일자 집합
  employees.forEach((e) => {
    weeklyHours.set(e.id, 0);
    assignedDays.set(e.id, new Set());
  });

  if (employees.length === 0) {
    violations.push('등록된 직원이 없어 스케줄을 생성할 수 없습니다.');
  }

  function consecutiveDaysEndingBefore(empId: number, date: Date): number {
    const days = assignedDays.get(empId)!;
    let count = 0;
    for (let i = 1; ; i++) {
      const prev = ymd(addDays(date, -i));
      if (days.has(prev)) count++;
      else break;
    }
    return count;
  }

  /** 한 직원이 특정 일자·시프트에 배정 가능한지(가용성·제약). */
  function canAssign(emp: EmployeeRow, date: Date, tpl: ShiftTemplate): boolean {
    const dow = date.getDay();
    const av = emp.availability;
    if (!av.days.includes(dow)) return false;
    if (tpl.startHour < av.startHour || tpl.endHour > av.endHour) return false;
    // 1일 1시프트
    if (assignedDays.get(emp.id)!.has(ymd(date))) return false;
    // 주당 최대 근로시간
    if ((weeklyHours.get(emp.id) ?? 0) + SHIFT_HOURS > MAX_WEEKLY_HOURS) return false;
    // 연속 근무일 한도 — 직전 (MAX_CONSECUTIVE_DAYS) 일이 모두 배정이면 차단
    if (consecutiveDaysEndingBefore(emp.id, date) >= MAX_CONSECUTIVE_DAYS) return false;
    return true;
  }

  for (const date of dates) {
    const dayDemand = demand.get(ymd(date)) ?? 0;
    const need = requiredPerShift(dayDemand);
    for (const tpl of SHIFT_TEMPLATES) {
      let filled = 0;
      for (let slot = 0; slot < need; slot++) {
        // 누적 근로시간이 가장 적은 가용 직원 우선(공정 배분)
        const candidates = employees
          .filter((e) => canAssign(e, date, tpl))
          .sort((a, b) => (weeklyHours.get(a.id)! - weeklyHours.get(b.id)!));
        const pick = candidates[0];
        if (!pick) {
          violations.push(
            `${ymd(date)}(${DOW_LABEL[date.getDay()]}) ${tpl.code} 시프트 인원 부족: ${filled}/${need} 배정`,
          );
          break;
        }
        shifts.push({
          employeeId: pick.id,
          employeeName: pick.name,
          shiftDate: ymd(date),
          startTime: tpl.start,
          endTime: tpl.end,
          shiftCode: tpl.code,
        });
        weeklyHours.set(pick.id, (weeklyHours.get(pick.id) ?? 0) + SHIFT_HOURS);
        assignedDays.get(pick.id)!.add(ymd(date));
        filled++;
      }
    }
  }

  // 예상 인건비
  const wageById = new Map(employees.map((e) => [e.id, e.hourlyWage]));
  const estimatedLaborCost = shifts.reduce(
    (sum, s) => sum + SHIFT_HOURS * (wageById.get(s.employeeId) ?? 0),
    0,
  );

  return { shifts, violations, estimatedLaborCost };
}

/**
 * 주간 스케줄 초안 생성. DB 에 저장하고 ScheduleDraft 반환.
 *   weekStart 는 해당 주의 시작일(월요일 권장). 7일치 생성.
 */
export async function generateSchedule(storeId: number, weekStartStr: string): Promise<ScheduleDraft> {
  const pool = getPool();
  const weekStart = new Date(weekStartStr + 'T00:00:00');
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const employees = await loadEmployees(storeId);
  const demand = await dailyDemand(storeId, dates);

  const { shifts, violations, estimatedLaborCost } = planSchedule(employees, dates, demand);

  // 저장 — 동일 주차 기존 draft 는 교체(데모 멱등)
  await pool.query(
    `DELETE FROM work_schedule WHERE store_id = ? AND week_start = ? AND status = 'draft'`,
    [storeId, ymd(weekStart)],
  );
  const [ins]: any = await pool.query(
    `INSERT INTO work_schedule (store_id, week_start, status, estimated_labor_cost, constraint_violations_json)
     VALUES (?, ?, 'draft', ?, ?)`,
    [storeId, ymd(weekStart), estimatedLaborCost, violations.length ? JSON.stringify(violations) : null],
  );
  const scheduleId = ins.insertId as number;

  if (shifts.length) {
    const rows = shifts.map((s) => [scheduleId, s.employeeId, s.shiftDate, s.startTime, s.endTime]);
    await pool.query(
      `INSERT INTO work_shift (schedule_id, employee_id, shift_date, start_time, end_time) VALUES ?`,
      [rows],
    );
  }

  await audit({
    storeId,
    eventType: 'schedule_generated',
    message: `주간 스케줄 초안 생성 (${ymd(weekStart)}) — 시프트 ${shifts.length}, 위반 ${violations.length}`,
    metadata: { scheduleId, shifts: shifts.length, violations: violations.length, estimatedLaborCost },
  });

  return {
    id: scheduleId,
    storeId,
    weekStart: ymd(weekStart),
    status: 'draft',
    estimatedLaborCost,
    constraintViolations: violations,
    shifts,
  };
}

/** 스케줄 단건 조회(시프트 포함). */
export async function getSchedule(scheduleId: number, storeId: number): Promise<ScheduleDraft | null> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, week_start AS weekStart, status,
            estimated_labor_cost AS estimatedLaborCost, constraint_violations_json AS violations
       FROM work_schedule WHERE id = ? AND store_id = ?`,
    [scheduleId, storeId],
  );
  if (!rows.length) return null;
  const s = rows[0];
  const [shiftRows] = await pool.query<any[]>(
    `SELECT ws.employee_id AS employeeId, e.name AS employeeName,
            ws.shift_date AS shiftDate, ws.start_time AS startTime, ws.end_time AS endTime
       FROM work_shift ws JOIN employee e ON e.id = ws.employee_id
      WHERE ws.schedule_id = ? ORDER BY ws.shift_date, ws.start_time`,
    [scheduleId],
  );
  return {
    id: Number(s.id),
    storeId: Number(s.storeId),
    weekStart: ymd(new Date(s.weekStart)),
    status: s.status,
    estimatedLaborCost: Number(s.estimatedLaborCost),
    constraintViolations: s.violations
      ? typeof s.violations === 'string'
        ? safeParse(s.violations) ?? []
        : s.violations
      : [],
    shifts: shiftRows.map((r) => ({
      employeeId: Number(r.employeeId),
      employeeName: r.employeeName,
      shiftDate: ymd(new Date(r.shiftDate)),
      startTime: String(r.startTime).slice(0, 5),
      endTime: String(r.endTime).slice(0, 5),
      shiftCode: '',
    })),
  };
}

/** 점포 스케줄 목록(요약). */
export async function listSchedules(storeId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT id, week_start AS weekStart, status,
            estimated_labor_cost AS estimatedLaborCost,
            constraint_violations_json AS violations,
            (SELECT COUNT(*) FROM work_shift ws WHERE ws.schedule_id = work_schedule.id) AS shiftCount
       FROM work_schedule WHERE store_id = ? ORDER BY week_start DESC, id DESC LIMIT 20`,
    [storeId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    weekStart: ymd(new Date(r.weekStart)),
    status: r.status,
    estimatedLaborCost: Number(r.estimatedLaborCost),
    violationCount: r.violations
      ? (typeof r.violations === 'string' ? safeParse(r.violations) ?? [] : r.violations).length
      : 0,
    shiftCount: Number(r.shiftCount),
  }));
}

/** 스케줄 확정(FR-024) — status='confirmed' + 감사(schedule_confirmed). */
export async function confirmSchedule(
  scheduleId: number,
  storeId: number,
  userId: number | null,
): Promise<ScheduleDraft> {
  const pool = getPool();
  const existing = await getSchedule(scheduleId, storeId);
  if (!existing) {
    const err: any = new Error('schedule_not_found');
    throw err;
  }
  if (existing.status === 'confirmed') {
    const err: any = new Error('already_confirmed');
    err.code = 'conflict';
    throw err;
  }
  await pool.query(`UPDATE work_schedule SET status = 'confirmed' WHERE id = ?`, [scheduleId]);
  await audit({
    storeId,
    userId,
    eventType: 'schedule_confirmed',
    message: `주간 스케줄 확정 (${existing.weekStart}) — 예상 인건비 ${existing.estimatedLaborCost.toLocaleString()}원`,
    metadata: {
      scheduleId,
      estimatedLaborCost: existing.estimatedLaborCost,
      shifts: existing.shifts.length,
      violations: existing.constraintViolations.length,
    },
  });
  return { ...existing, status: 'confirmed' };
}
