/**
 * 002 (T035) — Vision 시뮬레이션 확장: 동선/행동 이벤트 → 존(zone) 집계
 *   비식별 행동 통계(체류·통과·집음·내려놓음)와 추정 세그먼트 분포만 생성한다.
 *   개인 식별 정보는 생성/저장하지 않는다(SC-013).
 */

export interface BehaviorInsightDraft {
  zoneCode: string;
  zoneLabel: string;
  dwellWeight: number;
  passCount: number;
  pickupCount: number;
  putbackCount: number;
  demoSegment: { ageBands: Record<string, number>; gender: Record<string, number> };
}

// 매장 존 배치 (히트맵 그리드용 — row/col 은 프론트 표현용 메타)
const ZONES: Array<{ code: string; label: string; row: number; col: number; heat: number }> = [
  { code: 'A1', label: '음료 냉장', row: 0, col: 0, heat: 0.9 },
  { code: 'A2', label: '주류·음료', row: 0, col: 1, heat: 0.55 },
  { code: 'A3', label: '스낵', row: 0, col: 2, heat: 0.7 },
  { code: 'A4', label: '과자·캔디', row: 0, col: 3, heat: 0.45 },
  { code: 'B1', label: '도시락·김밥', row: 1, col: 0, heat: 1.0 },
  { code: 'B2', label: '즉석식품', row: 1, col: 1, heat: 0.65 },
  { code: 'B3', label: '냉동식품', row: 1, col: 2, heat: 0.4 },
  { code: 'B4', label: '아이스크림', row: 1, col: 3, heat: 0.5 },
  { code: 'C1', label: '생활용품', row: 2, col: 0, heat: 0.3 },
  { code: 'C2', label: '계산대', row: 2, col: 3, heat: 0.85 },
];

export function zoneGrid(): Array<{ code: string; label: string; row: number; col: number }> {
  return ZONES.map(({ code, label, row, col }) => ({ code, label, row, col }));
}

function jitter(base: number, pct = 0.25): number {
  return base * (1 - pct + Math.random() * pct * 2);
}

/** 한 점포·일자의 존별 행동 집계를 시뮬레이션 생성. */
export function simulateZoneInsights(_storeId: number, traffic = 1): BehaviorInsightDraft[] {
  return ZONES.map((z) => {
    const pass = Math.round(jitter(120 * z.heat * traffic));
    const pickup = Math.round(pass * jitter(0.35) * z.heat);
    const putback = Math.round(pickup * jitter(0.3));
    const dwell = Math.round(jitter(pass * z.heat * 4));
    return {
      zoneCode: z.code,
      zoneLabel: z.label,
      dwellWeight: dwell,
      passCount: pass,
      pickupCount: pickup,
      putbackCount: putback,
      demoSegment: simulateSegment(),
    };
  });
}

// 추정 연령대·성별 분포(비식별 — 합계 100%, 개인 식별 불가)
function simulateSegment(): { ageBands: Record<string, number>; gender: Record<string, number> } {
  const ageRaw = { '10s': jitter(15), '20s': jitter(30), '30s': jitter(25), '40s': jitter(18), '50s+': jitter(12) };
  const ageSum = Object.values(ageRaw).reduce((s, v) => s + v, 0);
  const ageBands: Record<string, number> = {};
  for (const [k, v] of Object.entries(ageRaw)) ageBands[k] = Math.round((v / ageSum) * 100);
  const m = Math.round(jitter(52));
  return { ageBands, gender: { male: m, female: 100 - m } };
}
