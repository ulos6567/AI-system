/**
 * 002 (T040) — IoT 센서 시뮬레이션 어댑터 (온도·전력 스트림)
 *   등록된 장비별로 정상 범위 근처의 측정값을 생성한다. 일부 장비는 시간이 지나며
 *   서서히 악화(drift)되어 예지보전 경고가 트리거되도록 한다(추세 기반 예측 시연).
 *   실제 전환 시 게이트웨이 조회로 교체.
 */
import type { IotAdapter, DeviceReadingSignal } from '../../ports/iot';
import { getPool } from '../../db/pool';

// 장비 타입별 정상 범위/전력 기준
const SPEC: Record<string, { tempMin: number; tempMax: number; power: number }> = {
  fridge: { tempMin: 1, tempMax: 5, power: 150 },
  showcase: { tempMin: 2, tempMax: 6, power: 180 },
  freezer: { tempMin: -20, tempMax: -15, power: 320 },
  hvac: { tempMin: 18, tempMax: 26, power: 800 },
};

// 장비별 악화 누적 상태(in-memory) — drift 가 쌓이면 임계 초과
const DRIFT = new Map<number, number>();

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function deviceSpec(type: string): { tempMin: number; tempMax: number; power: number } {
  return SPEC[type] ?? SPEC.fridge;
}

const adapter: IotAdapter = {
  name: 'iot-sim',
  async poll(storeId: number): Promise<DeviceReadingSignal[]> {
    const pool = getPool();
    const [devices] = await pool.query<any[]>(
      `SELECT id, device_type AS type FROM device WHERE store_id = ?`,
      [storeId],
    );
    const now = new Date();
    return devices.map((d: any) => {
      const spec = deviceSpec(d.type);
      // 장비 id 기준으로 일부(약 1/4)는 악화 추세
      const degrading = Number(d.id) % 4 === 0;
      let drift = DRIFT.get(d.id) ?? 0;
      if (degrading) drift = Math.min(drift + rand(0.05, 0.25), 12);
      DRIFT.set(d.id, drift);

      const temperature = Math.round((rand(spec.tempMin, spec.tempMax) + drift) * 10) / 10;
      const powerWatt = Math.round((spec.power * rand(0.9, 1.1) + drift * 8) * 10) / 10;
      return { deviceId: Number(d.id), temperature, powerWatt, readingAt: now };
    });
  },
};

/** 테스트/시드용 — drift 상태 초기화 */
export function resetDrift(): void {
  DRIFT.clear();
}

export default adapter;
