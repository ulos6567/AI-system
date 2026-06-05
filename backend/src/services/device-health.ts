/**
 * 002 (T041) — 예지보전 서비스 (FR-017~018, SC-004)
 *
 *   - ingestReadings: IoT 어댑터 폴링값을 device_reading 에 적재한다.
 *   - evaluateDevice: 최근 측정값의 임계 초과 + 추세(선형 외삽)로 상태/위험도를 판정하고,
 *     필요 시 maintenance_alert 를 생성한다. 임계(critical) 위험은 즉시 알림으로 격상한다.
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { getIotAdapter } from '../adapters/factory';
import { deviceSpec } from '../adapters/iot/sim';

const READING_WINDOW = 12; // 추세 계산용 최근 측정값 수
const PREDICT_HORIZON_HOURS = 24;

export interface DeviceRow {
  id: number;
  storeId: number;
  deviceType: string;
  label: string;
  status: 'normal' | 'warning' | 'critical' | 'offline';
  latestTemp: number | null;
  latestPower: number | null;
  latestAt: string | null;
  openAlerts: number;
}

/** 어댑터 폴링값을 적재. 적재된 측정값 수 반환. */
export async function ingestReadings(storeId: number): Promise<number> {
  const adapter = getIotAdapter();
  const readings = await adapter.poll(storeId);
  if (!readings.length) return 0;
  const pool = getPool();
  const rows = readings.map((r) => [r.deviceId, r.readingAt, r.temperature ?? null, r.powerWatt ?? null]);
  await pool.query(
    `INSERT INTO device_reading (device_id, reading_at, temperature, power_watt) VALUES ?`,
    [rows],
  );
  return readings.length;
}

/** 단순 선형 추세(℃/시간) — 최근 측정값들의 1차 회귀 기울기. */
function tempSlopePerHour(readings: Array<{ t: number; at: Date }>): number {
  if (readings.length < 2) return 0;
  const t0 = readings[0].at.getTime();
  const xs = readings.map((r) => (r.at.getTime() - t0) / 3600_000); // 시간
  const ys = readings.map((r) => r.t);
  const n = xs.length;
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-6) return 0;
  return (n * sxy - sx * sy) / denom;
}

/** 한 장비의 상태/위험도 평가 + 필요 시 경고 생성. */
export async function evaluateDevice(deviceId: number): Promise<{ status: string; alerted: boolean }> {
  const pool = getPool();
  const [devRows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, device_type AS type, label FROM device WHERE id = ?`,
    [deviceId],
  );
  if (!devRows.length) return { status: 'offline', alerted: false };
  const dev = devRows[0];
  const spec = deviceSpec(dev.type);

  const [readRows] = await pool.query<any[]>(
    `SELECT reading_at AS at, temperature AS temp FROM device_reading
      WHERE device_id = ? AND temperature IS NOT NULL
      ORDER BY reading_at DESC LIMIT ?`,
    [deviceId, READING_WINDOW],
  );
  if (!readRows.length) return { status: 'offline', alerted: false };

  const ordered = readRows.map((r) => ({ t: Number(r.temp), at: new Date(r.at) })).reverse();
  const current = ordered[ordered.length - 1].t;
  const slope = tempSlopePerHour(ordered);
  const predicted = current + slope * PREDICT_HORIZON_HOURS;

  const warnThreshold = spec.tempMax + 3;
  const critThreshold = spec.tempMax + 6;

  let status: 'normal' | 'warning' | 'critical' = 'normal';
  let riskLevel: 'info' | 'warning' | 'critical' | null = null;
  let recommended = '';
  let predictedFailureAt: Date | null = null;

  if (current >= critThreshold) {
    status = 'critical';
    riskLevel = 'critical';
    recommended = '즉시 점검 필요 — 임계 온도 초과. 식품 안전 위험.';
  } else if (current >= warnThreshold) {
    status = 'warning';
    riskLevel = 'warning';
    recommended = '점검 권장 — 정상 범위 초과.';
  } else if (slope > 0.1 && predicted >= warnThreshold) {
    // 추세상 향후 임계 도달 예상 → 예지보전 경고
    status = 'warning';
    riskLevel = 'warning';
    const hoursToWarn = (warnThreshold - current) / slope;
    predictedFailureAt = new Date(Date.now() + Math.max(0, hoursToWarn) * 3600_000);
    recommended = `온도 상승 추세(${slope.toFixed(2)}℃/h) — ${Math.round(hoursToWarn)}시간 내 임계 도달 예상. 사전 점검 권장.`;
  }

  // 장비 상태 갱신
  await pool.query(`UPDATE device SET status = ? WHERE id = ?`, [status, deviceId]);

  let alerted = false;
  if (riskLevel) {
    // 동일 장비의 미확인(open) 경고가 없을 때만 신규 생성(중복 방지)
    const [openRows] = await pool.query<any[]>(
      `SELECT id FROM maintenance_alert WHERE device_id = ? AND acknowledged_at IS NULL
         AND risk_level = ? AND raised_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR) LIMIT 1`,
      [deviceId, riskLevel],
    );
    if (!openRows.length) {
      await pool.query(
        `INSERT INTO maintenance_alert (device_id, risk_level, predicted_failure_at, recommended_action, raised_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [deviceId, riskLevel, predictedFailureAt, recommended],
      );
      alerted = true;
      await audit({
        storeId: Number(dev.storeId),
        severity: riskLevel === 'critical' ? 'critical' : 'warn',
        eventType: 'maintenance_alert',
        message: `${dev.label} 예지보전 경고 (${riskLevel}) — ${recommended}`,
        metadata: { deviceId, riskLevel, current, predicted: Math.round(predicted * 10) / 10, label: dev.label },
      });
    }
  }
  return { status, alerted };
}

/** 점포 전체 장비 평가(잡/조회 보장). */
export async function evaluateAllDevices(storeId: number): Promise<{ devices: number; alerts: number }> {
  const pool = getPool();
  const [devices] = await pool.query<any[]>(`SELECT id FROM device WHERE store_id = ?`, [storeId]);
  let alerts = 0;
  for (const d of devices) {
    const r = await evaluateDevice(Number(d.id));
    if (r.alerted) alerts++;
  }
  return { devices: devices.length, alerts };
}

export async function listDevices(storeId: number): Promise<DeviceRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT d.id, d.store_id AS storeId, d.device_type AS deviceType, d.label, d.status,
            lr.temperature AS latestTemp, lr.power_watt AS latestPower, lr.reading_at AS latestAt,
            (SELECT COUNT(*) FROM maintenance_alert ma WHERE ma.device_id = d.id AND ma.acknowledged_at IS NULL) AS openAlerts
       FROM device d
       LEFT JOIN device_reading lr ON lr.id = (
         SELECT id FROM device_reading r WHERE r.device_id = d.id ORDER BY reading_at DESC LIMIT 1
       )
      WHERE d.store_id = ?
      ORDER BY FIELD(d.status, 'critical','warning','normal','offline'), d.id`,
    [storeId],
  );
  return rows.map((r) => ({
    ...r,
    latestTemp: r.latestTemp === null ? null : Number(r.latestTemp),
    latestPower: r.latestPower === null ? null : Number(r.latestPower),
    openAlerts: Number(r.openAlerts),
  }));
}

export async function getDeviceHealth(deviceId: number): Promise<any> {
  const pool = getPool();
  const [devRows] = await pool.query<any[]>(
    `SELECT id, store_id AS storeId, device_type AS deviceType, label, status, spec_json AS spec
       FROM device WHERE id = ?`,
    [deviceId],
  );
  if (!devRows.length) return null;
  const [readings] = await pool.query<any[]>(
    `SELECT reading_at AS readingAt, temperature, power_watt AS powerWatt
       FROM device_reading WHERE device_id = ? ORDER BY reading_at DESC LIMIT 48`,
    [deviceId],
  );
  const [alerts] = await pool.query<any[]>(
    `SELECT id, risk_level AS riskLevel, predicted_failure_at AS predictedFailureAt,
            recommended_action AS recommendedAction, raised_at AS raisedAt, acknowledged_at AS acknowledgedAt
       FROM maintenance_alert WHERE device_id = ? ORDER BY raised_at DESC LIMIT 20`,
    [deviceId],
  );
  return {
    device: devRows[0],
    readings: readings.reverse(),
    alerts,
  };
}

export async function acknowledgeAlert(alertId: number, storeId: number, userId: number | null): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT ma.id, d.store_id AS storeId, d.label
       FROM maintenance_alert ma JOIN device d ON d.id = ma.device_id
      WHERE ma.id = ? AND d.store_id = ?`,
    [alertId, storeId],
  );
  if (!rows.length) throw new Error('alert_not_found');
  await pool.query(`UPDATE maintenance_alert SET acknowledged_at = NOW() WHERE id = ?`, [alertId]);
  await audit({
    storeId,
    userId,
    eventType: 'maintenance_ack',
    message: `예지보전 경고 #${alertId} 확인 (${rows[0].label})`,
    metadata: { alertId },
  });
}
